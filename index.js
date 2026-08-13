const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent, Collection } = require('discord.js');
const { MongoClient } = require('mongodb');

const TOKEN = process.env.DISCORD_TOKEN || 'ضع_التوكن_هنا';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';

// ------------------ MongoDB ------------------
let db;
let settingsCollection, punishmentsCollection, warnsCollection, logsCollection, exemptRolesCollection;

async function connectDB() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db('protection_bot');
    settingsCollection = db.collection('settings');
    punishmentsCollection = db.collection('punishments');
    warnsCollection = db.collection('warns');
    logsCollection = db.collection('logs');
    exemptRolesCollection = db.collection('exempt_roles');
    
    await settingsCollection.createIndex({ guild_id: 1 }, { unique: true });
    await punishmentsCollection.createIndex({ guild_id: 1, action: 1 }, { unique: true });
    await warnsCollection.createIndex({ guild_id: 1, user_id: 1 }, { unique: true });
    await logsCollection.createIndex({ guild_id: 1, time: -1 });
    await exemptRolesCollection.createIndex({ guild_id: 1, role_id: 1 }, { unique: true });
    
    console.log('✅ تم الاتصال بـ MongoDB');
}

// ------------------ دوال قاعدة البيانات ------------------
async function getSettings(guildId) {
    const doc = await settingsCollection.findOne({ guild_id: guildId });
    if (!doc) {
        const defaultConfig = {
            guild_id: guildId,
            protection: {
                anti_raid: false, anti_spam: false, anti_links: false, anti_bots: false,
                anti_selfbot: false, anti_webhook: false, anti_nick: false, anti_channel_delete: false,
                anti_channel_create: false, anti_role_delete: false, anti_role_create: false,
                anti_ban: false, anti_kick: false, anti_prune: false, anti_emoji_delete: false,
                anti_emoji_create: false, anti_sticker_delete: false, anti_sticker_create: false,
                anti_integration: false, anti_vanity: false, anti_alts: false, anti_toxic: false,
                anti_capslock: false, anti_massmention: false, anti_flood: false, anti_invite: false,
                anti_ghostping: false, anti_massban: false, anti_masskick: false, permission_guard: false
            },
            warn_threshold: 3
        };
        await settingsCollection.insertOne(defaultConfig);
        return defaultConfig;
    }
    return doc;
}

async function saveSettings(guildId, config) {
    await settingsCollection.updateOne(
        { guild_id: guildId },
        { $set: config },
        { upsert: true }
    );
}

async function getPunishment(guildId, action) {
    const doc = await punishmentsCollection.findOne({ guild_id: guildId, action: action });
    if (!doc) {
        const defaults = {
            spam: { punishment_type: 'كتم', duration: 300, threshold: 5, enabled: true },
            flood: { punishment_type: 'توقيت', duration: 60, threshold: 10, enabled: true },
            links: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: true },
            invite: { punishment_type: 'طرد', duration: 0, threshold: 1, enabled: true },
            toxic: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: true },
            caps: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: true },
            massmention: { punishment_type: 'كتم', duration: 600, threshold: 3, enabled: true },
            ghost: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: true },
            raid: { punishment_type: 'حظر', duration: 0, threshold: 5, enabled: true },
            alt: { punishment_type: 'طرد', duration: 0, threshold: 1, enabled: true },
            webhook: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: true },
            nick: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: true },
            channel_create: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: true },
            channel_delete: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: true },
            role_create: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: true },
            role_delete: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: true },
            ban: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: true },
            kick: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: true },
            emoji_create: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: true },
            emoji_delete: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: true },
            massban: { punishment_type: 'حظر', duration: 0, threshold: 3, enabled: true },
            masskick: { punishment_type: 'حظر', duration: 0, threshold: 3, enabled: true },
            permission_guard: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: true }
        };
        const def = defaults[action] || { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: true };
        const newDoc = { guild_id: guildId, action: action, ...def };
        await punishmentsCollection.insertOne(newDoc);
        return newDoc;
    }
    return doc;
}

async function savePunishment(guildId, action, data) {
    await punishmentsCollection.updateOne(
        { guild_id: guildId, action: action },
        { $set: { ...data, guild_id: guildId, action: action } },
        { upsert: true }
    );
}

async function getWarns(guildId, userId) {
    const doc = await warnsCollection.findOne({ guild_id: guildId, user_id: userId });
    return doc ? doc.count : 0;
}

async function setWarns(guildId, userId, count) {
    await warnsCollection.updateOne(
        { guild_id: guildId, user_id: userId },
        { $set: { count: count } },
        { upsert: true }
    );
}

async function addWarn(guildId, userId) {
    const current = await getWarns(guildId, userId);
    await setWarns(guildId, userId, current + 1);
    return current + 1;
}

async function resetWarns(guildId) {
    await warnsCollection.deleteMany({ guild_id: guildId });
}

async function addLog(guildId, type, userId, targetId, detail) {
    await logsCollection.insertOne({
        guild_id: guildId,
        time: Date.now(),
        type: type,
        user_id: userId,
        target_id: targetId,
        detail: detail
    });
}

async function getLogs(guildId, limit = 50) {
    return await logsCollection.find({ guild_id: guildId })
        .sort({ time: -1 })
        .limit(limit)
        .toArray();
}

async function getExemptRoles(guildId) {
    const docs = await exemptRolesCollection.find({ guild_id: guildId }).toArray();
    return docs.map(d => d.role_id);
}

async function addExemptRole(guildId, roleId) {
    await exemptRolesCollection.updateOne(
        { guild_id: guildId, role_id: roleId },
        { $set: { guild_id: guildId, role_id: roleId } },
        { upsert: true }
    );
}

async function removeExemptRole(guildId, roleId) {
    await exemptRolesCollection.deleteOne({ guild_id: guildId, role_id: roleId });
}

// ------------------ العميل ------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

const spamTracker = new Collection();
const floodTracker = new Collection();
const mentionTracker = new Collection();
const ghostTracker = new Collection();
const joinTimes = new Collection();

async function isExempt(guildId, member) {
    if (!member) return false;
    const exemptRoles = await getExemptRoles(guildId);
    return member.roles.cache.some(r => exemptRoles.includes(r.id));
}

async function applyPunishment(guild, user, action, punishmentData) {
    if (!guild || !user) return;
    try {
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;
        if (await isExempt(guild.id, member)) return;
        
        const p = punishmentData;
        if (!p.enabled) return;
        
        let result = '';
        switch (p.punishment_type) {
            case 'تحذير':
                const warns = await addWarn(guild.id, user.id);
                const settings = await getSettings(guild.id);
                const warnThreshold = settings.warn_threshold || 3;
                if (warns >= warnThreshold) {
                    const mutePun = await getPunishment(guild.id, 'spam');
                    await member.timeout((mutePun.duration || 300) * 1000, 'تجاوز حد التحذيرات').catch(() => {});
                    result = `⚠️ تحذير ${warns}/${warnThreshold} → كتم تلقائي`;
                } else {
                    result = `⚠️ تحذير ${warns}/${warnThreshold}`;
                }
                break;
            case 'كتم':
                await member.timeout((p.duration || 300) * 1000, `كتم تلقائي: ${p.duration}ث`).catch(() => {});
                result = `🔇 كتم ${p.duration}ث`;
                break;
            case 'طرد':
                await member.kick('طرد تلقائي').catch(() => {});
                result = '👢 طرد';
                break;
            case 'حظر':
                await member.ban({ days: 1, reason: 'حظر تلقائي' }).catch(() => {});
                result = '⛔ حظر';
                break;
            case 'إزالة رتب':
                const roles = member.roles.cache.filter(r => r.name !== '@everyone');
                await member.roles.remove(roles).catch(() => {});
                result = '🎭 إزالة جميع الرتب';
                break;
            case 'توقيت':
                await member.timeout((p.duration || 60) * 1000, `توقيت: ${p.duration}ث`).catch(() => {});
                result = `⏱️ توقيت ${p.duration}ث`;
                break;
            default:
                result = '⚠️ عقوبة غير معروفة';
        }
        await addLog(guild.id, 'عقوبة', client.user.id, user.id, `${action} → ${result}`);
        return result;
    } catch (e) {
        console.error('خطأ في العقوبة:', e);
    }
}

client.once('ready', () => {
    console.log(`✅ البوت متصل كـ ${client.user.tag}`);
    client.user.setActivity('!اللوحة | /اللوحة', { type: 3 });
});

// ------------------ لوحة التحكم (معدلة لتجنب الأخطاء) ------------------
async function sendMainPanel(message) {
    const embed = new EmbedBuilder()
        .setTitle('🛡️ لوحة التحكم الشاملة')
        .setDescription('اختر القائمة المطلوبة من الأزرار أدناه:')
        .setColor('#2b2d42')
        .setFooter({ text: 'نظام الحماية المتكامل - بالعربي' })
        .setTimestamp()
        .addFields(
            { name: '🛡️ الحماية', value: 'تشغيل وإطفاء أنظمة الحماية', inline: true },
            { name: '⭐ رتب الاستثناء', value: 'إدارة الرتب المستثناة', inline: true },
            { name: '⚖️ العقوبات المخصصة', value: 'تحديد عقوبة لكل فعل', inline: true },
            { name: '📋 السجل', value: 'عرض آخر الأحداث', inline: true },
            { name: '🔄 التحذيرات', value: 'إعادة تعيين تحذيرات الأعضاء', inline: true }
        );

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('menu_protection').setLabel('🛡️ الحماية').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('menu_exempt').setLabel('⭐ رتب الاستثناء').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('menu_punishments').setLabel('⚖️ العقوبات').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('menu_logs').setLabel('📋 السجل').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('menu_reset_warns').setLabel('🔄 إعادة تعيين').setStyle(ButtonStyle.Danger)
        );

    await message.reply({ embeds: [embed], components: [row] });
}

async function sendProtectionPanel(message, page = 0) {
    const settings = await getSettings(message.guild.id);
    const protectionKeys = Object.keys(settings.protection);
    const itemsPerPage = 20;
    const totalPages = Math.ceil(protectionKeys.length / itemsPerPage);
    if (page >= totalPages) page = 0;
    
    const start = page * itemsPerPage;
    const end = Math.min(start + itemsPerPage, protectionKeys.length);
    const currentKeys = protectionKeys.slice(start, end);

    const arabicNames = {
        anti_raid: 'مكافحة الريك', anti_spam: 'مكافحة السبام', anti_links: 'مكافحة الروابط', anti_bots: 'مكافحة البوتات',
        anti_selfbot: 'مكافحة السيلف بوت', anti_webhook: 'مكافحة الويبهوك', anti_nick: 'حماية النك نيم', anti_channel_delete: 'حماية حذف الرومات',
        anti_channel_create: 'منع إنشاء الرومات', anti_role_delete: 'حماية حذف الرتب', anti_role_create: 'منع إنشاء الرتب',
        anti_ban: 'مكافحة الحظر', anti_kick: 'مكافحة الطرد', anti_prune: 'مكافحة التنظيف', anti_emoji_delete: 'حماية حذف الإيموجي',
        anti_emoji_create: 'منع إنشاء الإيموجي', anti_sticker_delete: 'حماية حذف الملصقات', anti_sticker_create: 'منع إنشاء الملصقات',
        anti_integration: 'حماية التكاملات', anti_vanity: 'حماية الرابط الدعائي', anti_alts: 'مكافحة الحسابات الوهمية',
        anti_toxic: 'مكافحة الكلمات المسيئة', anti_capslock: 'مكافحة الأحرف الكبيرة', anti_massmention: 'مكافحة المنشن الجماعي',
        anti_flood: 'مكافحة التكرار', anti_invite: 'مكافحة دعوات السيرفرات', anti_ghostping: 'مكافحة الشبح',
        anti_massban: 'مكافحة الحظر الجماعي', anti_masskick: 'مكافحة الطرد الجماعي', permission_guard: 'حراسة الصلاحيات'
    };

    const embed = new EmbedBuilder()
        .setTitle('🛡️ لوحة الحماية')
        .setDescription(`اضغط على الأزرار لتشغيل أو إطفاء الحماية.\n🟢 مفعل | 🔴 معطل\n📄 صفحة ${page + 1} من ${totalPages}`)
        .setColor('#2b2d42')
        .setFooter({ text: '🔙 للعودة للقائمة الرئيسية' })
        .setTimestamp();

    let statusText = '';
    for (const key of currentKeys) {
        const val = settings.protection[key];
        const name = arabicNames[key] || key.replace(/_/g, ' ');
        statusText += `${val ? '🟢' : '🔴'} **${name}**\n`;
    }
    embed.addFields({ name: '📋 حالة الحماية', value: statusText, inline: false });

    const rows = [];
    let currentRow = new ActionRowBuilder();
    let count = 0;
    for (const key of currentKeys) {
        const name = arabicNames[key] || key.replace(/_/g, ' ');
        const label = name.length > 20 ? name.substring(0, 18) + '..' : name;
        const button = new ButtonBuilder()
            .setCustomId(`protect_${key}`)
            .setLabel(label)
            .setStyle(settings.protection[key] ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji(settings.protection[key] ? '✅' : '❌');
        currentRow.addComponents(button);
        count++;
        if (count % 4 === 0) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
    }
    if (currentRow.components.length > 0) rows.push(currentRow);

    const navRow = new ActionRowBuilder();
    if (page > 0) {
        navRow.addComponents(
            new ButtonBuilder().setCustomId(`protect_page_${page - 1}`).setLabel('◀ السابق').setStyle(ButtonStyle.Primary)
        );
    }
    if (page < totalPages - 1) {
        navRow.addComponents(
            new ButtonBuilder().setCustomId(`protect_page_${page + 1}`).setLabel('التالي ▶').setStyle(ButtonStyle.Primary)
        );
    }
    navRow.addComponents(
        new ButtonBuilder().setCustomId('menu_back').setLabel('🔙 العودة للقائمة').setStyle(ButtonStyle.Secondary)
    );

    const finalRows = [];
    let totalRows = 0;
    for (const row of rows) {
        if (totalRows < 4) {
            finalRows.push(row);
            totalRows++;
        }
    }
    if (navRow.components.length > 0 && totalRows < 5) {
        finalRows.push(navRow);
        totalRows++;
    }

    await message.reply({ embeds: [embed], components: finalRows });
}

async function sendExemptPanel(message) {
    const exemptRoles = await getExemptRoles(message.guild.id);
    const embed = new EmbedBuilder()
        .setTitle('⭐ رتب الاستثناء')
        .setDescription('الأعضاء الذين لديهم هذه الرتب **لن تطبق عليهم** أي عقوبات.')
        .setColor('#2b2d42')
        .setFooter({ text: '🔙 للعودة للقائمة الرئيسية' })
        .setTimestamp();

    let exemptList = 'لا توجد رتب مستثناة';
    if (exemptRoles.length > 0) {
        const guild = message.guild;
        const roleNames = exemptRoles.map(id => {
            const role = guild.roles.cache.get(id);
            return role ? `@${role.name}` : `❌ معرف غير موجود: ${id}`;
        });
        exemptList = roleNames.join('\n');
    }
    embed.addFields({ name: '📋 الرتب المستثناة حالياً', value: exemptList, inline: false });

    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('exempt_add').setLabel('➕ إضافة رتبة').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('exempt_remove').setLabel('➖ حذف رتبة').setStyle(ButtonStyle.Danger)
        );
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('menu_back').setLabel('🔙 العودة للقائمة').setStyle(ButtonStyle.Secondary)
        );

    await message.reply({ embeds: [embed], components: [row1, row2] });
}

async function sendPunishmentsPanel(message, page = 0) {
    const actions = [
        'spam', 'flood', 'links', 'invite', 'toxic', 'caps', 'massmention', 'ghost',
        'raid', 'alt', 'webhook', 'nick', 'channel_create', 'channel_delete',
        'role_create', 'role_delete', 'ban', 'kick', 'emoji_create', 'emoji_delete',
        'massban', 'masskick', 'permission_guard'
    ];
    
    const itemsPerPage = 10;
    const totalPages = Math.ceil(actions.length / itemsPerPage);
    if (page >= totalPages) page = 0;
    const start = page * itemsPerPage;
    const end = Math.min(start + itemsPerPage, actions.length);
    const currentActions = actions.slice(start, end);
    
    const embed = new EmbedBuilder()
        .setTitle('⚖️ العقوبات المخصصة لكل فعل')
        .setDescription(`اختر زر الفعل لتعديل عقوبته.\n📄 صفحة ${page + 1} من ${totalPages}`)
        .setColor('#2b2d42')
        .setFooter({ text: '🔙 للعودة للقائمة الرئيسية' })
        .setTimestamp();

    let list = '';
    for (const action of currentActions) {
        const p = await getPunishment(message.guild.id, action);
        const status = p.enabled ? '✅' : '❌';
        const type = p.punishment_type || 'تحذير';
        const duration = p.duration || 0;
        const threshold = p.threshold || 1;
        list += `${status} **${action}**: ${type} ${duration > 0 ? `(${duration}ث)` : ''} ${threshold > 1 ? `حد:${threshold}` : ''}\n`;
    }
    embed.addFields({ name: '📋 العقوبات الحالية', value: list || 'لا توجد عقوبات', inline: false });

    const rows = [];
    let currentRow = new ActionRowBuilder();
    let count = 0;
    for (const action of currentActions) {
        const label = action.length > 18 ? action.substring(0, 16) + '..' : action;
        const button = new ButtonBuilder()
            .setCustomId(`punish_edit_${action}`)
            .setLabel(label)
            .setStyle(ButtonStyle.Primary);
        currentRow.addComponents(button);
        count++;
        if (count % 5 === 0) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
    }
    if (currentRow.components.length > 0) rows.push(currentRow);

    const navRow = new ActionRowBuilder();
    if (page > 0) {
        navRow.addComponents(
            new ButtonBuilder().setCustomId(`punish_page_${page - 1}`).setLabel('◀ السابق').setStyle(ButtonStyle.Primary)
        );
    }
    if (page < totalPages - 1) {
        navRow.addComponents(
            new ButtonBuilder().setCustomId(`punish_page_${page + 1}`).setLabel('التالي ▶').setStyle(ButtonStyle.Primary)
        );
    }
    navRow.addComponents(
        new ButtonBuilder().setCustomId('menu_back').setLabel('🔙 القائمة الرئيسية').setStyle(ButtonStyle.Secondary)
    );

    const finalRows = [];
    let totalRows = 0;
    for (const row of rows) {
        if (totalRows < 4) {
            finalRows.push(row);
            totalRows++;
        }
    }
    if (navRow.components.length > 0 && totalRows < 5) {
        finalRows.push(navRow);
        totalRows++;
    }

    await message.reply({ embeds: [embed], components: finalRows });
}

async function sendEditPunishmentPanel(message, action) {
    const p = await getPunishment(message.guild.id, action);
    const embed = new EmbedBuilder()
        .setTitle(`⚖️ تعديل عقوبة: ${action}`)
        .setDescription(`اختر الإعداد الذي تريد تغييره:`)
        .setColor('#2b2d42')
        .setFooter({ text: '🔙 للعودة لقائمة العقوبات' })
        .setTimestamp()
        .addFields(
            { name: 'نوع العقوبة', value: p.punishment_type || 'تحذير', inline: true },
            { name: 'المدة (ثواني)', value: String(p.duration || 0), inline: true },
            { name: 'الحد (عدد التكرارات)', value: String(p.threshold || 1), inline: true },
            { name: 'مفعل', value: p.enabled ? '✅ نعم' : '❌ لا', inline: true }
        );

    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(`edit_type_${action}`).setLabel('📝 تغيير النوع').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`edit_duration_${action}`).setLabel('⏱️ تغيير المدة').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`edit_threshold_${action}`).setLabel('🔢 تغيير الحد').setStyle(ButtonStyle.Primary)
        );
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(`edit_toggle_${action}`).setLabel(p.enabled ? '❌ إطفاء' : '✅ تشغيل').setStyle(p.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder().setCustomId('punish_back').setLabel('🔙 العودة لقائمة العقوبات').setStyle(ButtonStyle.Secondary)
        );

    await message.reply({ embeds: [embed], components: [row1, row2] });
}

// ------------------ معالجة الأزرار ------------------
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.guild) return;

    // تجنب خطأ Unknown interaction
    if (!interaction.isRepliable()) return;
    
    try {
        const customId = interaction.customId;
        const guildId = interaction.guild.id;

        // القائمة الرئيسية
        if (customId === 'menu_protection') {
            await interaction.deferUpdate().catch(() => {});
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendProtectionPanel(fakeMessage, 0);
            return;
        }
        if (customId === 'menu_exempt') {
            await interaction.deferUpdate().catch(() => {});
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendExemptPanel(fakeMessage);
            return;
        }
        if (customId === 'menu_punishments') {
            await interaction.deferUpdate().catch(() => {});
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendPunishmentsPanel(fakeMessage, 0);
            return;
        }
        if (customId === 'menu_logs') {
            const logs = await getLogs(guildId, 30);
            const logText = logs.length > 0 ? logs.map(l => `${new Date(l.time).toLocaleString('ar-EG')} | ${l.type} | ${l.detail}`).join('\n') : '📭 لا توجد أحداث';
            const embed = new EmbedBuilder().setTitle('📋 سجل الأحداث').setDescription(`\`\`\`${logText}\`\`\``).setColor('#5865F2');
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }
        if (customId === 'menu_reset_warns') {
            await resetWarns(guildId);
            await interaction.reply({ content: '✅ تم إعادة تعيين جميع التحذيرات.', ephemeral: true });
            return;
        }
        if (customId === 'menu_back') {
            await interaction.deferUpdate().catch(() => {});
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendMainPanel(fakeMessage);
            return;
        }
        if (customId === 'punish_back') {
            await interaction.deferUpdate().catch(() => {});
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendPunishmentsPanel(fakeMessage, 0);
            return;
        }

        // التنقل بين صفحات الحماية
        if (customId.startsWith('protect_page_')) {
            const page = parseInt(customId.split('_')[2]);
            await interaction.deferUpdate().catch(() => {});
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendProtectionPanel(fakeMessage, page);
            return;
        }

        // التنقل بين صفحات العقوبات
        if (customId.startsWith('punish_page_')) {
            const page = parseInt(customId.split('_')[2]);
            await interaction.deferUpdate().catch(() => {});
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendPunishmentsPanel(fakeMessage, page);
            return;
        }

        // تفعيل/إطفاء الحماية
        if (customId.startsWith('protect_')) {
            const key = customId.replace('protect_', '');
            const settings = await getSettings(guildId);
            if (settings.protection.hasOwnProperty(key)) {
                settings.protection[key] = !settings.protection[key];
                await saveSettings(guildId, settings);
                await interaction.deferUpdate().catch(() => {});
                const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
                await sendProtectionPanel(fakeMessage, 0);
            }
            return;
        }

        // إدارة رتب الاستثناء
        if (customId === 'exempt_add') {
            await interaction.reply({ content: '📝 **أرسل معرف الرتبة (ID) التي تريد إضافتها للاستثناء.**\nمثال: `123456789012345678`', ephemeral: true });
            const filter = m => m.author.id === interaction.user.id && m.guild.id === interaction.guild.id;
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 });
            if (collected.size === 0) {
                await interaction.followUp({ content: '⏰ انتهى الوقت، حاول مرة أخرى.', ephemeral: true });
                return;
            }
            const msg = collected.first();
            const roleId = msg.content.trim();
            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) {
                await interaction.followUp({ content: '❌ معرف الرتبة غير صحيح، تأكد من الرقم.', ephemeral: true });
                return;
            }
            await addExemptRole(guildId, roleId);
            await interaction.followUp({ content: `✅ تم إضافة الرتبة **@${role.name}** إلى قائمة الاستثناء.`, ephemeral: true });
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendExemptPanel(fakeMessage);
            return;
        }

        if (customId === 'exempt_remove') {
            const exemptRoles = await getExemptRoles(guildId);
            if (exemptRoles.length === 0) {
                await interaction.reply({ content: '📭 لا توجد رتب مستثناة لحذفها.', ephemeral: true });
                return;
            }
            const list = exemptRoles.map((id, i) => {
                const role = interaction.guild.roles.cache.get(id);
                return `${i + 1}. ${role ? `@${role.name}` : `❌ معرف غير موجود: ${id}`}`;
            }).join('\n');
            await interaction.reply({ content: `📝 **اختر رقم الرتبة لحذفها:**\n${list}\nأرسل الرقم (مثال: 1)`, ephemeral: true });
            const filter = m => m.author.id === interaction.user.id && m.guild.id === interaction.guild.id;
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 });
            if (collected.size === 0) {
                await interaction.followUp({ content: '⏰ انتهى الوقت، حاول مرة أخرى.', ephemeral: true });
                return;
            }
            const msg = collected.first();
            const index = parseInt(msg.content.trim()) - 1;
            if (isNaN(index) || index < 0 || index >= exemptRoles.length) {
                await interaction.followUp({ content: '❌ رقم غير صحيح.', ephemeral: true });
                return;
            }
            const removedId = exemptRoles[index];
            await removeExemptRole(guildId, removedId);
            const role = interaction.guild.roles.cache.get(removedId);
            await interaction.followUp({ content: `✅ تم حذف الرتبة ${role ? `@${role.name}` : removedId} من قائمة الاستثناء.`, ephemeral: true });
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendExemptPanel(fakeMessage);
            return;
        }

        // تعديل العقوبات
        if (customId.startsWith('punish_edit_')) {
            const action = customId.replace('punish_edit_', '');
            await interaction.deferUpdate().catch(() => {});
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendEditPunishmentPanel(fakeMessage, action);
            return;
        }

        if (customId.startsWith('edit_type_')) {
            const action = customId.replace('edit_type_', '');
            const types = ['تحذير', 'كتم', 'طرد', 'حظر', 'إزالة رتب', 'توقيت'];
            await interaction.reply({ content: `📝 **اختر نوع العقوبة الجديد لـ ${action}:**\n${types.map((t, i) => `${i+1}. ${t}`).join('\n')}\nأرسل الرقم (مثال: 1)`, ephemeral: true });
            const filter = m => m.author.id === interaction.user.id && m.guild.id === interaction.guild.id;
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 });
            if (collected.size === 0) {
                await interaction.followUp({ content: '⏰ انتهى الوقت.', ephemeral: true });
                return;
            }
            const index = parseInt(collected.first().content.trim()) - 1;
            if (isNaN(index) || index < 0 || index >= types.length) {
                await interaction.followUp({ content: '❌ رقم غير صحيح.', ephemeral: true });
                return;
            }
            const p = await getPunishment(guildId, action);
            p.punishment_type = types[index];
            await savePunishment(guildId, action, p);
            await interaction.followUp({ content: `✅ تم تغيير عقوبة ${action} إلى ${types[index]}.`, ephemeral: true });
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendEditPunishmentPanel(fakeMessage, action);
            return;
        }

        if (customId.startsWith('edit_duration_')) {
            const action = customId.replace('edit_duration_', '');
            await interaction.reply({ content: `📝 **أرسل المدة الجديدة بالثواني لـ ${action} (0 = لا مدة):**`, ephemeral: true });
            const filter = m => m.author.id === interaction.user.id && m.guild.id === interaction.guild.id;
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 });
            if (collected.size === 0) {
                await interaction.followUp({ content: '⏰ انتهى الوقت.', ephemeral: true });
                return;
            }
            const val = parseInt(collected.first().content.trim());
            if (isNaN(val) || val < 0) {
                await interaction.followUp({ content: '❌ أرسل رقماً صحيحاً (0 أو أكثر).', ephemeral: true });
                return;
            }
            const p = await getPunishment(guildId, action);
            p.duration = val;
            await savePunishment(guildId, action, p);
            await interaction.followUp({ content: `✅ تم تغيير مدة ${action} إلى ${val} ثانية.`, ephemeral: true });
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendEditPunishmentPanel(fakeMessage, action);
            return;
        }

        if (customId.startsWith('edit_threshold_')) {
            const action = customId.replace('edit_threshold_', '');
            await interaction.reply({ content: `📝 **أرسل الحد الجديد (عدد التكرارات قبل تنفيذ العقوبة) لـ ${action}:**`, ephemeral: true });
            const filter = m => m.author.id === interaction.user.id && m.guild.id === interaction.guild.id;
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 });
            if (collected.size === 0) {
                await interaction.followUp({ content: '⏰ انتهى الوقت.', ephemeral: true });
                return;
            }
            const val = parseInt(collected.first().content.trim());
            if (isNaN(val) || val < 1) {
                await interaction.followUp({ content: '❌ أرسل رقماً صحيحاً أكبر من 0.', ephemeral: true });
                return;
            }
            const p = await getPunishment(guildId, action);
            p.threshold = val;
            await savePunishment(guildId, action, p);
            await interaction.followUp({ content: `✅ تم تغيير حد ${action} إلى ${val}.`, ephemeral: true });
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendEditPunishmentPanel(fakeMessage, action);
            return;
        }

        if (customId.startsWith('edit_toggle_')) {
            const action = customId.replace('edit_toggle_', '');
            const p = await getPunishment(guildId, action);
            p.enabled = !p.enabled;
            await savePunishment(guildId, action, p);
            await interaction.deferUpdate().catch(() => {});
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendEditPunishmentPanel(fakeMessage, action);
            return;
        }
    } catch (error) {
        console.error('خطأ في التفاعل:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ حدث خطأ، حاول مرة أخرى.', ephemeral: true });
            }
        } catch (e) {}
    }
});

// ------------------ أحداث الحماية ------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (await isExempt(message.guild.id, message.member)) return;
    
    const guildId = message.guild.id;
    const settings = await getSettings(guildId);
    const content = message.content.toLowerCase();

    if (content === '!اللوحة' || content === '/اللوحة' || content === '!panel' || content === '/panel' || content.includes('لوحة التحكم')) {
        await sendMainPanel(message);
        return;
    }

    // باقي الحماية...
    if (settings.protection.anti_spam) {
        const p = await getPunishment(guildId, 'spam');
        if (p.enabled) {
            if (!spamTracker.has(message.author.id)) spamTracker.set(message.author.id, []);
            const times = spamTracker.get(message.author.id);
            const now = Date.now();
            times.push(now);
            if (times.length > 20) times.shift();
            const recent = times.filter(t => now - t < 3000);
            if (recent.length >= p.threshold) {
                await message.delete().catch(() => {});
                await applyPunishment(message.guild, message.author, 'spam', p);
                return;
            }
        }
    }

    if (settings.protection.anti_flood) {
        const p = await getPunishment(guildId, 'flood');
        if (p.enabled) {
            if (!floodTracker.has(message.channel.id)) floodTracker.set(message.channel.id, []);
            const times = floodTracker.get(message.channel.id);
            const now = Date.now();
            times.push(now);
            if (times.length > 30) times.shift();
            const recent = times.filter(t => now - t < 5000);
            if (recent.length >= p.threshold) {
                await message.delete().catch(() => {});
                await applyPunishment(message.guild, message.author, 'flood', p);
                return;
            }
        }
    }

    if (settings.protection.anti_links) {
        const p = await getPunishment(guildId, 'links');
        if (p.enabled && /(https?:\/\/[^\s]+|discord\.gg\/[a-zA-Z0-9]+|discord\.com\/invite\/[a-zA-Z0-9]+)/i.test(content)) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'links', p);
            return;
        }
    }

    if (settings.protection.anti_invite) {
        const p = await getPunishment(guildId, 'invite');
        if (p.enabled && /discord\.gg\/[a-zA-Z0-9]+/i.test(content)) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'invite', p);
            return;
        }
    }

    if (settings.protection.anti_toxic) {
        const p = await getPunishment(guildId, 'toxic');
        if (p.enabled) {
            const toxic = ['fuck', 'shit', 'asshole', 'bitch', 'cunt', 'nigger', 'faggot', 'kys', 'die', 'kill', 'خول', 'قحبة', 'منيك', 'كس', 'زبي', 'عاهر', 'شرموطة'];
            if (toxic.some(w => content.includes(w))) {
                await message.delete().catch(() => {});
                await applyPunishment(message.guild, message.author, 'toxic', p);
                return;
            }
        }
    }

    if (settings.protection.anti_capslock) {
        const p = await getPunishment(guildId, 'caps');
        if (p.enabled) {
            const letters = message.content.replace(/[^a-zA-Z]/g, '');
            if (letters.length > 10 && letters.toUpperCase() === letters && letters.length / message.content.length > 0.7) {
                await message.delete().catch(() => {});
                await applyPunishment(message.guild, message.author, 'caps', p);
                return;
            }
        }
    }

    if (settings.protection.anti_massmention) {
        const p = await getPunishment(guildId, 'massmention');
        if (p.enabled && message.mentions.users.size > 5) {
            if (!mentionTracker.has(message.author.id)) mentionTracker.set(message.author.id, []);
            const times = mentionTracker.get(message.author.id);
            const now = Date.now();
            times.push(now);
            if (times.length > 20) times.shift();
            const recent = times.filter(t => now - t < 10000);
            if (recent.length >= p.threshold) {
                await message.delete().catch(() => {});
                await applyPunishment(message.guild, message.author, 'massmention', p);
                return;
            }
        }
    }

    if (message.mentions.users.size > 0) {
        ghostTracker.set(message.id, { author: message.author, mentions: message.mentions.users, time: Date.now() });
    }
});

client.on('messageDelete', async (message) => {
    if (!message.guild || !message.author || message.author.bot) return;
    const settings = await getSettings(message.guild.id);
    if (!settings.protection.anti_ghostping) return;
    if (await isExempt(message.guild.id, message.member)) return;
    if (ghostTracker.has(message.id)) {
        const data = ghostTracker.get(message.id);
        if (data.mentions.size > 0 && Date.now() - data.time < 5000) {
            const p = await getPunishment(message.guild.id, 'ghost');
            if (p.enabled) {
                await applyPunishment(message.guild, message.author, 'ghost', p);
                await addLog(message.guild.id, 'شبح', client.user.id, message.author.id, 'حذف منشن');
            }
        }
        ghostTracker.delete(message.id);
    }
});

// أحداث الحماية الإضافية (مختصرة)
client.on('guildMemberAdd', async (member) => {
    const settings = await getSettings(member.guild.id);
    if (await isExempt(member.guild.id, member)) return;
    
    if (settings.protection.anti_raid) {
        const p = await getPunishment(member.guild.id, 'raid');
        if (p.enabled) {
            const now = Date.now();
            if (!joinTimes.has(member.guild.id)) joinTimes.set(member.guild.id, []);
            const times = joinTimes.get(member.guild.id);
            times.push(now);
            if (times.length > 20) times.shift();
            const recent = times.filter(t => now - t < 10000);
            if (recent.length >= p.threshold) {
                await applyPunishment(member.guild, member.user, 'raid', p);
                await addLog(member.guild.id, 'ريك', client.user.id, member.id, 'هجوم جماعي');
                return;
            }
        }
    }
    if (settings.protection.anti_alts) {
        const p = await getPunishment(member.guild.id, 'alt');
        if (p.enabled) {
            const age = (Date.now() - member.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            if (age < 7) {
                await applyPunishment(member.guild, member.user, 'alt', p);
                await addLog(member.guild.id, 'وهمي', client.user.id, member.id, 'حساب وهمي');
            }
        }
    }
});

client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    const settings = await getSettings(channel.guild.id);
    if (!settings.protection.anti_channel_create) return;
    const audit = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !(await isExempt(channel.guild.id, await channel.guild.members.fetch(entry.executor.id).catch(() => null)))) {
        const p = await getPunishment(channel.guild.id, 'channel_create');
        if (p.enabled) {
            await channel.delete().catch(() => {});
            await applyPunishment(channel.guild, entry.executor, 'channel_create', p);
        }
    }
});

client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const settings = await getSettings(channel.guild.id);
    if (!settings.protection.anti_channel_delete) return;
    const audit = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
    const entry = audit.entries.first();
    if (entry?.executor && !(await isExempt(channel.guild.id, await channel.guild.members.fetch(entry.executor.id).catch(() => null)))) {
        const p = await getPunishment(channel.guild.id, 'channel_delete');
        if (p.enabled) {
            await applyPunishment(channel.guild, entry.executor, 'channel_delete', p);
        }
    }
});

client.on('roleCreate', async (role) => {
    if (!role.guild) return;
    const settings = await getSettings(role.guild.id);
    if (!settings.protection.anti_role_create) return;
    const audit = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !(await isExempt(role.guild.id, await role.guild.members.fetch(entry.executor.id).catch(() => null)))) {
        const p = await getPunishment(role.guild.id, 'role_create');
        if (p.enabled) {
            await role.delete().catch(() => {});
            await applyPunishment(role.guild, entry.executor, 'role_create', p);
        }
    }
});

client.on('roleDelete', async (role) => {
    if (!role.guild) return;
    const settings = await getSettings(role.guild.id);
    if (!settings.protection.anti_role_delete) return;
    const audit = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete });
    const entry = audit.entries.first();
    if (entry?.executor && !(await isExempt(role.guild.id, await role.guild.members.fetch(entry.executor.id).catch(() => null)))) {
        const p = await getPunishment(role.guild.id, 'role_delete');
        if (p.enabled) {
            await applyPunishment(role.guild, entry.executor, 'role_delete', p);
        }
    }
});

client.on('guildBanAdd', async (ban) => {
    const settings = await getSettings(ban.guild.id);
    if (!settings.protection.anti_ban) return;
    const audit = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
    const entry = audit.entries.first();
    if (entry?.executor && !(await isExempt(ban.guild.id, await ban.guild.members.fetch(entry.executor.id).catch(() => null)))) {
        const p = await getPunishment(ban.guild.id, 'ban');
        if (p.enabled) {
            await ban.guild.members.unban(ban.user).catch(() => {});
            await applyPunishment(ban.guild, entry.executor, 'ban', p);
        }
    }
});

client.on('guildMemberRemove', async (member) => {
    if (!member.guild) return;
    const settings = await getSettings(member.guild.id);
    if (!settings.protection.anti_kick) return;
    const audit = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
    const entry = audit.entries.first();
    if (entry?.executor && !(await isExempt(member.guild.id, await member.guild.members.fetch(entry.executor.id).catch(() => null)))) {
        const p = await getPunishment(member.guild.id, 'kick');
        if (p.enabled) {
            await applyPunishment(member.guild, entry.executor, 'kick', p);
        }
    }
});

client.on('webhookUpdate', async (webhook) => {
    if (!webhook.guild) return;
    const settings = await getSettings(webhook.guild.id);
    if (!settings.protection.anti_webhook) return;
    const audit = await webhook.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !(await isExempt(webhook.guild.id, await webhook.guild.members.fetch(entry.executor.id).catch(() => null)))) {
        const p = await getPunishment(webhook.guild.id, 'webhook');
        if (p.enabled) {
            const hooks = await webhook.guild.fetchWebhooks();
            for (const wh of hooks.values()) { if (wh.createdAt.getTime() > Date.now() - 5000) await wh.delete().catch(() => {}); }
            await applyPunishment(webhook.guild, entry.executor, 'webhook', p);
        }
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (oldMember.nickname === newMember.nickname) return;
    const settings = await getSettings(newMember.guild.id);
    if (!settings.protection.anti_nick) return;
    if (await isExempt(newMember.guild.id, newMember)) return;
    const audit = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
    const entry = audit.entries.first();
    if (entry?.executor && !(await isExempt(newMember.guild.id, await newMember.guild.members.fetch(entry.executor.id).catch(() => null)))) {
        const p = await getPunishment(newMember.guild.id, 'nick');
        if (p.enabled) {
            await newMember.setNickname(oldMember.nickname).catch(() => {});
            await applyPunishment(newMember.guild, entry.executor, 'nick', p);
        }
    }
});

client.on('emojiCreate', async (emoji) => {
    if (!emoji.guild) return;
    const settings = await getSettings(emoji.guild.id);
    if (!settings.protection.anti_emoji_create) return;
    const audit = await emoji.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.EmojiCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !(await isExempt(emoji.guild.id, await emoji.guild.members.fetch(entry.executor.id).catch(() => null)))) {
        const p = await getPunishment(emoji.guild.id, 'emoji_create');
        if (p.enabled) {
            await emoji.delete().catch(() => {});
            await applyPunishment(emoji.guild, entry.executor, 'emoji_create', p);
        }
    }
});

client.on('emojiDelete', async (emoji) => {
    if (!emoji.guild) return;
    const settings = await getSettings(emoji.guild.id);
    if (!settings.protection.anti_emoji_delete) return;
    const audit = await emoji.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.EmojiDelete });
    const entry = audit.entries.first();
    if (entry?.executor && !(await isExempt(emoji.guild.id, await emoji.guild.members.fetch(entry.executor.id).catch(() => null)))) {
        const p = await getPunishment(emoji.guild.id, 'emoji_delete');
        if (p.enabled) {
            await applyPunishment(emoji.guild, entry.executor, 'emoji_delete', p);
        }
    }
});

// ------------------ التشغيل ------------------
(async () => {
    await connectDB();
    client.login(TOKEN);
})();

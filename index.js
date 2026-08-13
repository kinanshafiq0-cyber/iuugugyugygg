const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent, Collection } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

const TOKEN = process.env.DISCORD_TOKEN || 'ضع_التوكن_هنا';
const db = new sqlite3.Database('./data.db');

// ------------------ إنشاء الجداول ------------------
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS settings (guild_id TEXT PRIMARY KEY, config TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS punishments (guild_id TEXT, action TEXT, punishment_type TEXT, duration INTEGER, threshold INTEGER, enabled INTEGER, PRIMARY KEY (guild_id, action))`);
    db.run(`CREATE TABLE IF NOT EXISTS warns (guild_id TEXT, user_id TEXT, count INTEGER, PRIMARY KEY (guild_id, user_id))`);
    db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, time INTEGER, type TEXT, user_id TEXT, target_id TEXT, detail TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS exempt_roles (guild_id TEXT, role_id TEXT, PRIMARY KEY (guild_id, role_id))`);
});

// ------------------ دوال قاعدة البيانات ------------------
function getSettings(guildId) {
    return new Promise((resolve) => {
        db.get('SELECT config FROM settings WHERE guild_id = ?', [guildId], (err, row) => {
            if (err || !row) {
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
                db.run('INSERT OR REPLACE INTO settings (guild_id, config) VALUES (?, ?)', [guildId, JSON.stringify(defaultConfig)]);
                resolve(defaultConfig);
            } else {
                resolve(JSON.parse(row.config));
            }
        });
    });
}

function saveSettings(guildId, config) {
    return new Promise((resolve) => {
        db.run('INSERT OR REPLACE INTO settings (guild_id, config) VALUES (?, ?)', [guildId, JSON.stringify(config)], resolve);
    });
}

function getPunishment(guildId, action) {
    return new Promise((resolve) => {
        db.get('SELECT * FROM punishments WHERE guild_id = ? AND action = ?', [guildId, action], (err, row) => {
            if (err || !row) {
                const defaults = {
                    spam: { punishment_type: 'كتم', duration: 300, threshold: 5, enabled: 1 },
                    flood: { punishment_type: 'توقيت', duration: 60, threshold: 10, enabled: 1 },
                    links: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: 1 },
                    invite: { punishment_type: 'طرد', duration: 0, threshold: 1, enabled: 1 },
                    toxic: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: 1 },
                    caps: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: 1 },
                    massmention: { punishment_type: 'كتم', duration: 600, threshold: 3, enabled: 1 },
                    ghost: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: 1 },
                    raid: { punishment_type: 'حظر', duration: 0, threshold: 5, enabled: 1 },
                    alt: { punishment_type: 'طرد', duration: 0, threshold: 1, enabled: 1 },
                    webhook: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: 1 },
                    nick: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: 1 },
                    channel_create: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: 1 },
                    channel_delete: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: 1 },
                    role_create: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: 1 },
                    role_delete: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: 1 },
                    ban: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: 1 },
                    kick: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: 1 },
                    emoji_create: { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: 1 },
                    emoji_delete: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: 1 },
                    massban: { punishment_type: 'حظر', duration: 0, threshold: 3, enabled: 1 },
                    masskick: { punishment_type: 'حظر', duration: 0, threshold: 3, enabled: 1 },
                    permission_guard: { punishment_type: 'حظر', duration: 0, threshold: 1, enabled: 1 }
                };
                const def = defaults[action] || { punishment_type: 'تحذير', duration: 0, threshold: 1, enabled: 1 };
                db.run('INSERT OR REPLACE INTO punishments (guild_id, action, punishment_type, duration, threshold, enabled) VALUES (?, ?, ?, ?, ?, ?)',
                    [guildId, action, def.punishment_type, def.duration, def.threshold, def.enabled]);
                resolve({ ...def, guild_id: guildId, action: action });
            } else {
                resolve(row);
            }
        });
    });
}

function savePunishment(guildId, action, data) {
    return new Promise((resolve) => {
        db.run('INSERT OR REPLACE INTO punishments (guild_id, action, punishment_type, duration, threshold, enabled) VALUES (?, ?, ?, ?, ?, ?)',
            [guildId, action, data.punishment_type, data.duration || 0, data.threshold || 1, data.enabled ? 1 : 0], resolve);
    });
}

function getWarns(guildId, userId) {
    return new Promise((resolve) => {
        db.get('SELECT count FROM warns WHERE guild_id = ? AND user_id = ?', [guildId, userId], (err, row) => {
            resolve(row ? row.count : 0);
        });
    });
}

function setWarns(guildId, userId, count) {
    return new Promise((resolve) => {
        db.run('INSERT OR REPLACE INTO warns (guild_id, user_id, count) VALUES (?, ?, ?)', [guildId, userId, count], resolve);
    });
}

function addWarn(guildId, userId) {
    return new Promise(async (resolve) => {
        const current = await getWarns(guildId, userId);
        await setWarns(guildId, userId, current + 1);
        resolve(current + 1);
    });
}

function resetWarns(guildId) {
    return new Promise((resolve) => {
        db.run('DELETE FROM warns WHERE guild_id = ?', [guildId], resolve);
    });
}

function addLog(guildId, type, userId, targetId, detail) {
    db.run('INSERT INTO logs (guild_id, time, type, user_id, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
        [guildId, Date.now(), type, userId, targetId, detail]);
}

function getLogs(guildId, limit = 50) {
    return new Promise((resolve) => {
        db.all('SELECT * FROM logs WHERE guild_id = ? ORDER BY time DESC LIMIT ?', [guildId, limit], (err, rows) => {
            resolve(rows || []);
        });
    });
}

function getExemptRoles(guildId) {
    return new Promise((resolve) => {
        db.all('SELECT role_id FROM exempt_roles WHERE guild_id = ?', [guildId], (err, rows) => {
            resolve(rows ? rows.map(r => r.role_id) : []);
        });
    });
}

function addExemptRole(guildId, roleId) {
    return new Promise((resolve) => {
        db.run('INSERT OR REPLACE INTO exempt_roles (guild_id, role_id) VALUES (?, ?)', [guildId, roleId], resolve);
    });
}

function removeExemptRole(guildId, roleId) {
    return new Promise((resolve) => {
        db.run('DELETE FROM exempt_roles WHERE guild_id = ? AND role_id = ?', [guildId, roleId], resolve);
    });
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
        addLog(guild.id, 'عقوبة', client.user.id, user.id, `${action} → ${result}`);
        return result;
    } catch (e) {
        console.error('خطأ في العقوبة:', e);
    }
}

client.once('ready', () => {
    console.log(`✅ البوت متصل كـ ${client.user.tag}`);
    client.user.setActivity('!اللوحة | /اللوحة', { type: 3 });
});

// ------------------ دوال عرض اللوحات ------------------
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
    if (!interaction.isRepliable()) return;
    
    try {
        const customId = interaction.customId;
        const guildId = interaction.guild.id;

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

        if (customId.startsWith('protect_page_')) {
            const page = parseInt(customId.split('_')[2]);
            await interaction.deferUpdate().catch(() => {});
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendProtectionPanel(fakeMessage, page);
            return;
        }

        if (customId.startsWith('punish_page_')) {
            const page = parseInt(customId.split('_')[2]);
            await interaction.deferUpdate().catch(() => {});
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data).catch(() => {}); }, author: interaction.user, guild: interaction.guild };
            await sendPunishmentsPanel(fakeMessage, page);
            return;
        }

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
                await interaction.followUp({ content:

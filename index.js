const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent, Collection } = require('discord.js');
const fs = require('fs');

const TOKEN = process.env.DISCORD_TOKEN || 'ضع_التوكن_هنا';
const CONFIG_FILE = './config.json';

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

// جميع الحماية = false (طافية)
let config = {
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
    punishments: {
        warn: { enabled: true, threshold: 3 },
        mute: { enabled: true, duration: 300 },
        kick: { enabled: true },
        ban: { enabled: true, days: 1 },
        removeroles: { enabled: true },
        timeout: { enabled: true, duration: 60 }
    },
    exempt_roles: [],
    log_channel: null
};

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        config = { ...config, ...data };
    }
}
function saveConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4), 'utf8');
}
loadConfig();

const spamTracker = new Collection();
const floodTracker = new Collection();
const mentionTracker = new Collection();
const ghostTracker = new Collection();
const userWarns = new Collection();
const joinTimes = new Collection();
let eventLog = [];
let panelPage = {};

function isExempt(member) {
    if (!member) return false;
    return member.roles.cache.some(r => config.exempt_roles.includes(r.id));
}

function logEvent(type, guildId, userId, targetId, detail) {
    eventLog.push({ time: Date.now(), type, guild: guildId, user: userId, target: targetId, detail });
    if (eventLog.length > 500) eventLog.shift();
}

async function applyPunishment(guild, user, action) {
    if (!guild || !user) return;
    try {
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member || isExempt(member)) return;
        switch (action) {
            case 'تحذير':
                const warns = (userWarns.get(user.id) || 0) + 1;
                userWarns.set(user.id, warns);
                if (warns >= config.punishments.warn.threshold) await applyPunishment(guild, user, 'كتم');
                break;
            case 'كتم': if (config.punishments.mute.enabled) await member.timeout(config.punishments.mute.duration * 1000, 'كتم تلقائي'); break;
            case 'طرد': if (config.punishments.kick.enabled) await member.kick('طرد تلقائي'); break;
            case 'حظر': if (config.punishments.ban.enabled) await member.ban({ days: config.punishments.ban.days, reason: 'حظر تلقائي' }); break;
            case 'إزالة رتب': if (config.punishments.removeroles.enabled) { const roles = member.roles.cache.filter(r => r.name !== '@everyone'); await member.roles.remove(roles); } break;
            case 'توقيت': if (config.punishments.timeout.enabled) await member.timeout(config.punishments.timeout.duration * 1000, 'توقيت مؤقت'); break;
        }
        logEvent('عقوبة', guild.id, client.user.id, user.id, action);
    } catch (e) {}
}

client.once('ready', () => {
    console.log(`✅ البوت متصل كـ ${client.user.tag}`);
    client.user.setActivity('!اللوحة | /اللوحة', { type: 3 });
});

async function sendPanel(message, page = 0) {
    const protectionKeys = Object.keys(config.protection);
    const itemsPerPage = 25;
    const totalPages = Math.ceil(protectionKeys.length / itemsPerPage);
    if (page >= totalPages) page = 0;
    
    const start = page * itemsPerPage;
    const end = Math.min(start + itemsPerPage, protectionKeys.length);
    const currentKeys = protectionKeys.slice(start, end);

    // أسماء عربية للحماية
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
        .setTitle('🛡️ لوحة تحكم الحماية الشاملة')
        .setDescription(`اضغط على الأزرار لتشغيل أو إطفاء الحماية.\n🟢 مفعل | 🔴 معطل\n📄 صفحة ${page + 1} من ${totalPages}`)
        .setColor('#2b2d42')
        .setFooter({ text: 'نظام الحماية المتكامل - بالعربي' })
        .setTimestamp();

    let statusText = '';
    for (const key of currentKeys) {
        const val = config.protection[key];
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
            .setStyle(config.protection[key] ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji(config.protection[key] ? '✅' : '❌');
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
            new ButtonBuilder().setCustomId(`page_${page - 1}`).setLabel('◀ السابق').setStyle(ButtonStyle.Primary)
        );
    }
    if (page < totalPages - 1) {
        navRow.addComponents(
            new ButtonBuilder().setCustomId(`page_${page + 1}`).setLabel('التالي ▶').setStyle(ButtonStyle.Primary)
        );
    }

    const extraRow = new ActionRowBuilder();
    if (page === 0) {
        extraRow.addComponents(
            new ButtonBuilder().setCustomId('logs').setLabel('📋 السجل').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('reset_warns').setLabel('🔄 إعادة تعيين التحذيرات').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('refresh').setLabel('🔄 تحديث اللوحة').setStyle(ButtonStyle.Primary)
        );
    }

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
    if (extraRow.components.length > 0 && totalRows < 5) {
        finalRows.push(extraRow);
        totalRows++;
    }

    await message.reply({ embeds: [embed], components: finalRows });
}

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.guild) return;

    const customId = interaction.customId;

    if (customId.startsWith('page_')) {
        const page = parseInt(customId.split('_')[1]);
        await interaction.deferUpdate();
        const fakeMessage = { reply: async (data) => { await interaction.editReply(data); }, author: interaction.user, guild: interaction.guild };
        await sendPanel(fakeMessage, page);
        return;
    }

    if (customId.startsWith('protect_')) {
        const key = customId.replace('protect_', '');
        if (config.protection.hasOwnProperty(key)) {
            config.protection[key] = !config.protection[key];
            saveConfig();
            await interaction.deferUpdate();
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data); }, author: interaction.user, guild: interaction.guild };
            const currentPage = panelPage[interaction.user.id] || 0;
            await sendPanel(fakeMessage, currentPage);
        }
        return;
    }

    if (customId === 'logs') {
        const logs = eventLog.slice(-20).reverse();
        const logText = logs.map(l => `${new Date(l.time).toLocaleString('ar-EG')} | ${l.type} | ${l.detail}`).join('\n') || '📭 لا توجد أحداث';
        const embed = new EmbedBuilder().setTitle('📋 سجل الأحداث').setDescription(`\`\`\`${logText}\`\`\``).setColor('#5865F2');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }

    if (customId === 'reset_warns') {
        userWarns.clear();
        await interaction.reply({ content: '✅ تم إعادة تعيين جميع التحذيرات.', ephemeral: true });
        return;
    }

    if (customId === 'refresh') {
        await interaction.deferUpdate();
        const fakeMessage = { reply: async (data) => { await interaction.editReply(data); }, author: interaction.user, guild: interaction.guild };
        const currentPage = panelPage[interaction.user.id] || 0;
        await sendPanel(fakeMessage, currentPage);
        return;
    }
});

// ------- أحداث الحماية (كلها مشروطة بالتفعيل) -------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (isExempt(message.member)) return;
    const content = message.content.toLowerCase();

    // أوامر فتح اللوحة
    if (content === '!اللوحة' || content === '/اللوحة' || content === '!panel' || content === '/panel' || content.includes('لوحة التحكم')) {
        panelPage[message.author.id] = 0;
        await sendPanel(message, 0);
        return;
    }

    // الحماية تشتغل فقط إذا كانت مفعلة
    if (config.protection.anti_spam) {
        if (!spamTracker.has(message.author.id)) spamTracker.set(message.author.id, []);
        const times = spamTracker.get(message.author.id);
        const now = Date.now();
        times.push(now);
        if (times.length > 10) times.shift();
        if (times.filter(t => now - t < 3000).length >= 5) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'كتم');
            return;
        }
    }
    if (config.protection.anti_flood) {
        if (!floodTracker.has(message.channel.id)) floodTracker.set(message.channel.id, []);
        const times = floodTracker.get(message.channel.id);
        const now = Date.now();
        times.push(now);
        if (times.length > 20) times.shift();
        if (times.filter(t => now - t < 5000).length >= 10) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'توقيت');
            return;
        }
    }
    if (config.protection.anti_links) {
        if (/(https?:\/\/[^\s]+|discord\.gg\/[a-zA-Z0-9]+|discord\.com\/invite\/[a-zA-Z0-9]+)/i.test(content)) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'تحذير');
            return;
        }
    }
    if (config.protection.anti_invite) {
        if (/discord\.gg\/[a-zA-Z0-9]+/i.test(content)) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'طرد');
            return;
        }
    }
    if (config.protection.anti_toxic) {
        const toxic = ['fuck', 'shit', 'asshole', 'bitch', 'cunt', 'nigger', 'faggot', 'kys', 'die', 'kill', 'خول', 'قحبة', 'منيك', 'كس', 'زبي', 'عاهر', 'شرموطة'];
        if (toxic.some(w => content.includes(w))) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'تحذير');
            return;
        }
    }
    if (config.protection.anti_capslock) {
        const letters = message.content.replace(/[^a-zA-Z]/g, '');
        if (letters.length > 10 && letters.toUpperCase() === letters && letters.length / message.content.length > 0.7) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'تحذير');
            return;
        }
    }
    if (config.protection.anti_massmention) {
        if (message.mentions.users.size > 5) {
            if (!mentionTracker.has(message.author.id)) mentionTracker.set(message.author.id, []);
            const times = mentionTracker.get(message.author.id);
            const now = Date.now();
            times.push(now);
            if (times.length > 10) times.shift();
            if (times.filter(t => now - t < 10000).length >= 3) {
                await message.delete().catch(() => {});
                await applyPunishment(message.guild, message.author, 'كتم');
                return;
            }
        }
    }
    if (message.mentions.users.size > 0) {
        ghostTracker.set(message.id, { author: message.author, mentions: message.mentions.users, time: Date.now() });
    }
});

client.on('messageDelete', async (message) => {
    if (!config.protection.anti_ghostping || !message.guild || !message.author || message.author.bot) return;
    if (isExempt(message.member)) return;
    if (ghostTracker.has(message.id)) {
        const data = ghostTracker.get(message.id);
        if (data.mentions.size > 0 && Date.now() - data.time < 5000) {
            await applyPunishment(message.guild, message.author, 'تحذير');
            logEvent('شبح', message.guild.id, client.user.id, message.author.id, 'حذف منشن');
        }
        ghostTracker.delete(message.id);
    }
});

// أحداث إضافية
client.on('channelCreate', async (channel) => {
    if (!config.protection.anti_channel_create || !channel.guild) return;
    const audit = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await channel.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await channel.delete().catch(() => {});
        await applyPunishment(channel.guild, entry.executor, 'حظر');
    }
});
client.on('channelDelete', async (channel) => {
    if (!config.protection.anti_channel_delete || !channel.guild) return;
    const audit = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await channel.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(channel.guild, entry.executor, 'حظر');
    }
});
client.on('roleCreate', async (role) => {
    if (!config.protection.anti_role_create || !role.guild) return;
    const audit = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await role.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await role.delete().catch(() => {});
        await applyPunishment(role.guild, entry.executor, 'حظر');
    }
});
client.on('roleDelete', async (role) => {
    if (!config.protection.anti_role_delete || !role.guild) return;
    const audit = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await role.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(role.guild, entry.executor, 'حظر');
    }
});
client.on('guildBanAdd', async (ban) => {
    if (!config.protection.anti_ban) return;
    const audit = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await ban.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await ban.guild.members.unban(ban.user).catch(() => {});
        await applyPunishment(ban.guild, entry.executor, 'حظر');
    }
});
client.on('guildMemberRemove', async (member) => {
    if (!config.protection.anti_kick || !member.guild) return;
    const audit = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await member.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(member.guild, entry.executor, 'حظر');
    }
});
client.on('webhookUpdate', async (webhook) => {
    if (!config.protection.anti_webhook || !webhook.guild) return;
    const audit = await webhook.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await webhook.guild.members.fetch(entry.executor.id).catch(() => null))) {
        const hooks = await webhook.guild.fetchWebhooks();
        for (const wh of hooks.values()) { if (wh.createdAt.getTime() > Date.now() - 5000) await wh.delete().catch(() => {}); }
        await applyPunishment(webhook.guild, entry.executor, 'حظر');
    }
});
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!config.protection.anti_nick || oldMember.nickname === newMember.nickname || isExempt(newMember)) return;
    const audit = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await newMember.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await newMember.setNickname(oldMember.nickname).catch(() => {});
        await applyPunishment(newMember.guild, entry.executor, 'تحذير');
    }
});
client.on('emojiCreate', async (emoji) => {
    if (!config.protection.anti_emoji_create || !emoji.guild) return;
    const audit = await emoji.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.EmojiCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await emoji.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await emoji.delete().catch(() => {});
        await applyPunishment(emoji.guild, entry.executor, 'تحذير');
    }
});
client.on('emojiDelete', async (emoji) => {
    if (!config.protection.anti_emoji_delete || !emoji.guild) return;
    const audit = await emoji.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.EmojiDelete });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await emoji.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(emoji.guild, entry.executor, 'حظر');
    }
});

client.login(TOKEN);

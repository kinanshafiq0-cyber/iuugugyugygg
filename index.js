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

let config = {
    protection: {
        anti_raid: true, anti_spam: true, anti_links: true, anti_bots: true,
        anti_selfbot: true, anti_webhook: true, anti_nick: true, anti_channel_delete: true,
        anti_channel_create: true, anti_role_delete: true, anti_role_create: true,
        anti_ban: true, anti_kick: true, anti_prune: true, anti_emoji_delete: true,
        anti_emoji_create: true, anti_sticker_delete: true, anti_sticker_create: true,
        anti_integration: true, anti_vanity: true, anti_alts: true, anti_toxic: true,
        anti_capslock: true, anti_massmention: true, anti_flood: true, anti_invite: true,
        anti_ghostping: true, anti_massban: true, anti_masskick: true, permission_guard: true
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
let panelPage = {}; // لتخزين الصفحة الحالية لكل مستخدم

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
            case 'warn':
                const warns = (userWarns.get(user.id) || 0) + 1;
                userWarns.set(user.id, warns);
                if (warns >= config.punishments.warn.threshold) await applyPunishment(guild, user, 'mute');
                break;
            case 'mute': if (config.punishments.mute.enabled) await member.timeout(config.punishments.mute.duration * 1000, 'تقييد'); break;
            case 'kick': if (config.punishments.kick.enabled) await member.kick('طرد'); break;
            case 'ban': if (config.punishments.ban.enabled) await member.ban({ days: config.punishments.ban.days, reason: 'حظر' }); break;
            case 'removeroles': if (config.punishments.removeroles.enabled) { const roles = member.roles.cache.filter(r => r.name !== '@everyone'); await member.roles.remove(roles); } break;
            case 'timeout': if (config.punishments.timeout.enabled) await member.timeout(config.punishments.timeout.duration * 1000, 'توقيت'); break;
        }
        logEvent('punishment', guild.id, client.user.id, user.id, action);
    } catch (e) {}
}

client.once('ready', () => {
    console.log(`✅ البوت متصل كـ ${client.user.tag}`);
    client.user.setActivity('!panel | /panel', { type: 3 });
});

// دالة إرسال اللوحة مع تقسيم الأزرار إلى 5 صفوف كحد أقصى
async function sendPanel(message, page = 0) {
    const protectionKeys = Object.keys(config.protection);
    const itemsPerPage = 25; // 5 صفوف × 5 أزرار
    const totalPages = Math.ceil(protectionKeys.length / itemsPerPage);
    if (page >= totalPages) page = 0;
    
    const start = page * itemsPerPage;
    const end = Math.min(start + itemsPerPage, protectionKeys.length);
    const currentKeys = protectionKeys.slice(start, end);

    const embed = new EmbedBuilder()
        .setTitle('🛡️ لوحة تحكم الحماية')
        .setDescription(`اضغط على الأزرار لتغيير حالة الحماية.\n🟢 مفعل | 🔴 معطل\nصفحة ${page + 1} من ${totalPages}`)
        .setColor('#2b2d42')
        .setFooter({ text: 'نظام الحماية المتكامل' })
        .setTimestamp();

    let statusText = '';
    const emojis = {
        anti_raid: '🚫', anti_spam: '🔄', anti_links: '🔗', anti_bots: '🤖',
        anti_webhook: '📡', anti_nick: '✏️', anti_channel_delete: '🗑️', anti_channel_create: '📂',
        anti_role_delete: '🎭', anti_role_create: '➕', anti_ban: '⛔', anti_kick: '👢',
        anti_alts: '👤', anti_toxic: '💬', anti_capslock: '🔠', anti_massmention: '📢',
        anti_flood: '🌊', anti_invite: '📨', anti_ghostping: '👻', anti_massban: '🧹',
        anti_masskick: '🧹', permission_guard: '🛡️',
        anti_selfbot: '🤖', anti_prune: '🧹', anti_emoji_delete: '😢', anti_emoji_create: '➕',
        anti_sticker_delete: '🏷️', anti_sticker_create: '➕', anti_integration: '🔌', anti_vanity: '🔗'
    };
    for (const key of currentKeys) {
        const val = config.protection[key];
        const emoji = emojis[key] || '⚙️';
        statusText += `${emoji} **${key.replace(/_/g, ' ')}** : ${val ? '🟢 مفعل' : '🔴 معطل'}\n`;
    }
    embed.addFields({ name: '📋 الحالة', value: statusText, inline: false });

    // بناء الصفوف (كل صف 5 أزرار كحد أقصى)
    const rows = [];
    let currentRow = new ActionRowBuilder();
    let count = 0;
    for (const key of currentKeys) {
        const label = key.replace(/_/g, ' ').substring(0, 20);
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

    // أزرار التنقل (السابق/التالي) + أزرار إضافية
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
    // إضافة أزرار إضافية فقط في الصفحة الأولى
    const extraRow = new ActionRowBuilder();
    if (page === 0) {
        extraRow.addComponents(
            new ButtonBuilder().setCustomId('logs').setLabel('📋 السجل').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('reset_warns').setLabel('🔄 إعادة تعيين').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('refresh').setLabel('🔄 تحديث').setStyle(ButtonStyle.Primary)
        );
    }

    // تجميع الصفوف (حد أقصى 5 صفوف)
    const finalRows = [];
    let totalRows = 0;
    for (const row of rows) {
        if (totalRows < 4) { // نترك صف واحد للأزرار الإضافية
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

    // التنقل بين الصفحات
    if (customId.startsWith('page_')) {
        const page = parseInt(customId.split('_')[1]);
        await interaction.deferUpdate();
        const fakeMessage = { reply: async (data) => { await interaction.editReply(data); }, author: interaction.user, guild: interaction.guild };
        await sendPanel(fakeMessage, page);
        return;
    }

    // تفعيل/تعطيل الحماية
    if (customId.startsWith('protect_')) {
        const key = customId.replace('protect_', '');
        if (config.protection.hasOwnProperty(key)) {
            config.protection[key] = !config.protection[key];
            saveConfig();
            await interaction.deferUpdate();
            const fakeMessage = { reply: async (data) => { await interaction.editReply(data); }, author: interaction.user, guild: interaction.guild };
            // الحفاظ على الصفحة الحالية
            const currentPage = panelPage[interaction.user.id] || 0;
            await sendPanel(fakeMessage, currentPage);
        }
        return;
    }

    if (customId === 'logs') {
        const logs = eventLog.slice(-20).reverse();
        const logText = logs.map(l => `${new Date(l.time).toLocaleString()} | ${l.type} | ${l.detail}`).join('\n') || 'لا توجد أحداث';
        const embed = new EmbedBuilder().setTitle('📋 السجل').setDescription(`\`\`\`${logText}\`\`\``).setColor('#5865F2');
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

// ------- أحداث الحماية (مختصرة) -------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (isExempt(message.member)) return;
    const content = message.content.toLowerCase();

    if (content === '!panel' || content === '/panel' || content === '!حماية' || content === '/حماية' || content.includes('لوحة التحكم')) {
        panelPage[message.author.id] = 0;
        await sendPanel(message, 0);
        return;
    }

    // باقي الحماية...
    if (config.protection.anti_spam) {
        if (!spamTracker.has(message.author.id)) spamTracker.set(message.author.id, []);
        const times = spamTracker.get(message.author.id);
        const now = Date.now();
        times.push(now);
        if (times.length > 10) times.shift();
        if (times.filter(t => now - t < 3000).length >= 5) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'mute');
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
            await applyPunishment(message.guild, message.author, 'timeout');
            return;
        }
    }
    if (config.protection.anti_links) {
        if (/(https?:\/\/[^\s]+|discord\.gg\/[a-zA-Z0-9]+|discord\.com\/invite\/[a-zA-Z0-9]+)/i.test(content)) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'warn');
            return;
        }
    }
    if (config.protection.anti_invite) {
        if (/discord\.gg\/[a-zA-Z0-9]+/i.test(content)) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'kick');
            return;
        }
    }
    if (config.protection.anti_toxic) {
        const toxic = ['fuck', 'shit', 'asshole', 'bitch', 'cunt', 'nigger', 'faggot', 'kys', 'die', 'kill', 'خول', 'قحبة', 'منيك', 'كس', 'زبي'];
        if (toxic.some(w => content.includes(w))) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'warn');
            return;
        }
    }
    if (config.protection.anti_capslock) {
        const letters = message.content.replace(/[^a-zA-Z]/g, '');
        if (letters.length > 10 && letters.toUpperCase() === letters && letters.length / message.content.length > 0.7) {
            await message.delete().catch(() => {});
            await applyPunishment(message.guild, message.author, 'warn');
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
                await applyPunishment(message.guild, message.author, 'mute');
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
            await applyPunishment(message.guild, message.author, 'warn');
            logEvent('ghostping', message.guild.id, client.user.id, message.author.id, 'حذف منشن');
        }
        ghostTracker.delete(message.id);
    }
});

// أحداث الحماية الإضافية (مختصرة)
client.on('channelCreate', async (channel) => {
    if (!config.protection.anti_channel_create || !channel.guild) return;
    const audit = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await channel.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await channel.delete().catch(() => {});
        await applyPunishment(channel.guild, entry.executor, 'ban');
    }
});
client.on('channelDelete', async (channel) => {
    if (!config.protection.anti_channel_delete || !channel.guild) return;
    const audit = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await channel.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(channel.guild, entry.executor, 'ban');
    }
});
client.on('roleCreate', async (role) => {
    if (!config.protection.anti_role_create || !role.guild) return;
    const audit = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await role.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await role.delete().catch(() => {});
        await applyPunishment(role.guild, entry.executor, 'ban');
    }
});
client.on('roleDelete', async (role) => {
    if (!config.protection.anti_role_delete || !role.guild) return;
    const audit = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await role.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(role.guild, entry.executor, 'ban');
    }
});
client.on('guildBanAdd', async (ban) => {
    if (!config.protection.anti_ban) return;
    const audit = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await ban.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await ban.guild.members.unban(ban.user).catch(() => {});
        await applyPunishment(ban.guild, entry.executor, 'ban');
    }
});
client.on('guildMemberRemove', async (member) => {
    if (!config.protection.anti_kick || !member.guild) return;
    const audit = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await member.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(member.guild, entry.executor, 'ban');
    }
});
client.on('webhookUpdate', async (webhook) => {
    if (!config.protection.anti_webhook || !webhook.guild) return;
    const audit = await webhook.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await webhook.guild.members.fetch(entry.executor.id).catch(() => null))) {
        const hooks = await webhook.guild.fetchWebhooks();
        for (const wh of hooks.values()) { if (wh.createdAt.getTime() > Date.now() - 5000) await wh.delete().catch(() => {}); }
        await applyPunishment(webhook.guild, entry.executor, 'ban');
    }
});
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!config.protection.anti_nick || oldMember.nickname === newMember.nickname || isExempt(newMember)) return;
    const audit = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await newMember.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await newMember.setNickname(oldMember.nickname).catch(() => {});
        await applyPunishment(newMember.guild, entry.executor, 'warn');
    }
});
client.on('emojiCreate', async (emoji) => {
    if (!config.protection.anti_emoji_create || !emoji.guild) return;
    const audit = await emoji.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.EmojiCreate });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await emoji.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await emoji.delete().catch(() => {});
        await applyPunishment(emoji.guild, entry.executor, 'warn');
    }
});
client.on('emojiDelete', async (emoji) => {
    if (!config.protection.anti_emoji_delete || !emoji.guild) return;
    const audit = await emoji.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.EmojiDelete });
    const entry = audit.entries.first();
    if (entry?.executor && !isExempt(await emoji.guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(emoji.guild, entry.executor, 'ban');
    }
});

client.login(TOKEN);

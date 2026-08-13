const { Client, GatewayIntentBits, Partials, Events, PermissionsBitField, AuditLogEvent, ChannelType, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

// ------------------ التوكن والإعدادات ------------------
const TOKEN = process.env.DISCORD_TOKEN || 'ضع_التوكن_هنا';
const WEB_PASSWORD = process.env.WEB_PASSWORD || 'admin123';
const CONFIG_FILE = './config.json';
const BACKUP_FILE = './backup.json';
const LOG_FILE = './event_log.json';

// ------------------ إعدادات العميل ------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember, Partials.Reaction]
});

// ------------------ قاعدة الإعدادات ------------------
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
    log_channel: null,
    backup_interval: 3600
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

// ------------------ الحالات الداخلية ------------------
const spamTracker = new Collection();
const floodTracker = new Collection();
const mentionTracker = new Collection();
const ghostTracker = new Collection();
const userWarns = new Collection();
const joinTimes = new Collection();
let eventLog = [];
let backupData = {};

// ------------------ دوال المساعدة ------------------
function isExempt(member) {
    if (!member) return false;
    return member.roles.cache.some(r => config.exempt_roles.includes(r.id));
}

function logEvent(type, guildId, userId, targetId, detail) {
    const entry = { time: Date.now(), type, guild: guildId, user: userId, target: targetId, detail };
    eventLog.push(entry);
    if (eventLog.length > 1000) eventLog.shift();
    fs.writeFileSync(LOG_FILE, JSON.stringify(eventLog, null, 4), 'utf8');
}

// ------------------ نظام العقوبات ------------------
async function applyPunishment(guild, user, action) {
    if (!guild || !user) return;
    try {
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;
        if (isExempt(member)) return;

        switch (action) {
            case 'warn':
                const warns = (userWarns.get(user.id) || 0) + 1;
                userWarns.set(user.id, warns);
                if (warns >= config.punishments.warn.threshold) {
                    await applyPunishment(guild, user, 'mute');
                }
                break;
            case 'mute':
                if (config.punishments.mute.enabled) {
                    await member.timeout(config.punishments.mute.duration * 1000, 'تقييد تلقائي من نظام الحماية');
                }
                break;
            case 'kick':
                if (config.punishments.kick.enabled) {
                    await member.kick('طرد تلقائي من نظام الحماية');
                }
                break;
            case 'ban':
                if (config.punishments.ban.enabled) {
                    await member.ban({ days: config.punishments.ban.days, reason: 'حظر تلقائي من نظام الحماية' });
                }
                break;
            case 'removeroles':
                if (config.punishments.removeroles.enabled) {
                    const roles = member.roles.cache.filter(r => r.name !== '@everyone');
                    await member.roles.remove(roles);
                }
                break;
            case 'timeout':
                if (config.punishments.timeout.enabled) {
                    await member.timeout(config.punishments.timeout.duration * 1000, 'توقيت مؤقت من نظام الحماية');
                }
                break;
        }
        logEvent('punishment', guild.id, client.user.id, user.id, action);
    } catch (e) {
        console.error('خطأ في تطبيق العقوبة:', e);
    }
}

// ------------------ النسخ الاحتياطي والاستعادة ------------------
async function backupGuild(guild) {
    try {
        const data = {
            channels: guild.channels.cache.map(c => ({
                name: c.name,
                type: c.type,
                position: c.position,
                parentId: c.parentId,
                topic: c.topic || null,
                slowmode: c.rateLimitPerUser || 0,
                nsfw: c.nsfw || false
            })),
            roles: guild.roles.cache.filter(r => r.name !== '@everyone').map(r => ({
                name: r.name,
                color: r.color,
                permissions: r.permissions.bitfield.toString(),
                position: r.position,
                hoist: r.hoist,
                mentionable: r.mentionable,
                icon: r.iconURL(),
                unicodeEmoji: r.unicodeEmoji
            })),
            categories: guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).map(c => ({
                name: c.name,
                position: c.position
            }))
        };
        fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 4), 'utf8');
        backupData[guild.id] = data;
        return data;
    } catch (e) {
        console.error('خطأ في النسخ الاحتياطي:', e);
        return null;
    }
}

async function restoreGuild(guild) {
    if (!fs.existsSync(BACKUP_FILE)) return;
    try {
        const data = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
        
        // حذف القنوات الحالية (ما عدا القنوات النظامية)
        for (const c of guild.channels.cache.values()) {
            if (c.manageable) {
                await c.delete().catch(() => {});
            }
        }
        
        // حذف الرتب الحالية (ما عدا @everyone)
        for (const r of guild.roles.cache.values()) {
            if (r.name !== '@everyone' && r.editable) {
                await r.delete().catch(() => {});
            }
        }
        
        // استعادة الفئات
        for (const cat of data.categories || []) {
            await guild.channels.create({
                name: cat.name,
                type: ChannelType.GuildCategory,
                position: cat.position
            }).catch(() => {});
        }
        
        // استعادة القنوات
        for (const ch of data.channels || []) {
            const category = ch.parentId ? guild.channels.cache.get(ch.parentId) : null;
            const options = {
                name: ch.name,
                position: ch.position,
                parent: category,
                topic: ch.topic,
                rateLimitPerUser: ch.slowmode,
                nsfw: ch.nsfw
            };
            if (ch.type === ChannelType.GuildText) {
                await guild.channels.create({ ...options, type: ChannelType.GuildText });
            } else if (ch.type === ChannelType.GuildVoice) {
                await guild.channels.create({ ...options, type: ChannelType.GuildVoice });
            }
        }
        
        // استعادة الرتب
        for (const r of (data.roles || []).sort((a, b) => a.position - b.position)) {
            await guild.roles.create({
                name: r.name,
                color: r.color,
                permissions: BigInt(r.permissions),
                position: r.position,
                hoist: r.hoist,
                mentionable: r.mentionable,
                icon: r.icon,
                unicodeEmoji: r.unicodeEmoji
            }).catch(() => {});
        }
        
        logEvent('restore', guild.id, client.user.id, guild.id, 'تم استعادة النسخ الاحتياطي');
    } catch (e) {
        console.error('خطأ في الاستعادة:', e);
    }
}

// ------------------ أحداث البوت ------------------
client.once('ready', () => {
    console.log(`✅ البوت متصل كـ ${client.user.tag}`);
    // بدء النسخ الاحتياطي الدوري
    setInterval(() => {
        client.guilds.cache.forEach(g => backupGuild(g));
    }, config.backup_interval * 1000);
    // نسخ احتياطي أولي
    client.guilds.cache.forEach(g => backupGuild(g));
});

// ------------------ الحماية: دخول الأعضاء ------------------
client.on('guildMemberAdd', async (member) => {
    if (!config.protection.anti_raid && !config.protection.anti_alts) return;
    if (isExempt(member)) return;
    
    const guild = member.guild;
    
    // مكافحة الـ Raid
    if (config.protection.anti_raid) {
        const now = Date.now();
        if (!joinTimes.has(guild.id)) joinTimes.set(guild.id, []);
        const times = joinTimes.get(guild.id);
        times.push(now);
        if (times.length > 10) times.shift();
        const recent = times.filter(t => now - t < 10000);
        if (recent.length >= 5) {
            await applyPunishment(guild, member.user, 'ban');
            logEvent('raid', guild.id, client.user.id, member.id, 'تم اكتشاف هجوم جماعي');
            return;
        }
    }
    
    // مكافحة الحسابات الوهمية
    if (config.protection.anti_alts) {
        const accountAge = (Date.now() - member.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (accountAge < 7) {
            await applyPunishment(guild, member.user, 'kick');
            logEvent('alt', guild.id, client.user.id, member.id, 'حساب وهمي (أقل من 7 أيام)');
        }
    }
});

// ------------------ الحماية: الرسائل ------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (isExempt(message.member)) return;
    
    const guild = message.guild;
    const member = message.member;
    const content = message.content.toLowerCase();
    
    // مكافحة السبام
    if (config.protection.anti_spam) {
        if (!spamTracker.has(message.author.id)) spamTracker.set(message.author.id, []);
        const times = spamTracker.get(message.author.id);
        const now = Date.now();
        times.push(now);
        if (times.length > 10) times.shift();
        const recent = times.filter(t => now - t < 3000);
        if (recent.length >= 5) {
            await message.delete().catch(() => {});
            await applyPunishment(guild, message.author, 'mute');
            logEvent('spam', guild.id, client.user.id, message.author.id, 'سبام مفرط');
            return;
        }
    }
    
    // مكافحة الفيضان (Flood)
    if (config.protection.anti_flood) {
        if (!floodTracker.has(message.channel.id)) floodTracker.set(message.channel.id, []);
        const times = floodTracker.get(message.channel.id);
        const now = Date.now();
        times.push(now);
        if (times.length > 20) times.shift();
        const recent = times.filter(t => now - t < 5000);
        if (recent.length >= 10) {
            await message.delete().catch(() => {});
            await applyPunishment(guild, message.author, 'timeout');
            logEvent('flood', guild.id, client.user.id, message.author.id, 'فيضان رسائل');
            return;
        }
    }
    
    // مكافحة الروابط
    if (config.protection.anti_links) {
        const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[a-zA-Z0-9]+|discord\.com\/invite\/[a-zA-Z0-9]+)/i;
        if (linkRegex.test(content)) {
            await message.delete().catch(() => {});
            await applyPunishment(guild, message.author, 'warn');
            logEvent('link', guild.id, client.user.id, message.author.id, 'رابط محظور');
            return;
        }
    }
    
    // مكافحة دعوات السيرفرات
    if (config.protection.anti_invite) {
        const inviteRegex = /discord\.gg\/[a-zA-Z0-9]+/i;
        if (inviteRegex.test(content)) {
            await message.delete().catch(() => {});
            await applyPunishment(guild, message.author, 'kick');
            logEvent('invite', guild.id, client.user.id, message.author.id, 'دعوة سيرفر');
            return;
        }
    }
    
    // مكافحة الكلمات المسيئة
    if (config.protection.anti_toxic) {
        const toxicWords = ['fuck', 'shit', 'asshole', 'bitch', 'cunt', 'nigger', 'faggot', 'kys', 'die', 'kill'];
        if (toxicWords.some(w => content.includes(w))) {
            await message.delete().catch(() => {});
            await applyPunishment(guild, message.author, 'warn');
            logEvent('toxic', guild.id, client.user.id, message.author.id, 'كلمة مسيئة');
            return;
        }
    }
    
    // مكافحة الأحرف الكبيرة
    if (config.protection.anti_capslock) {
        const letters = message.content.replace(/[^a-zA-Z]/g, '');
        if (letters.length > 10 && letters.toUpperCase() === letters) {
            const upperRatio = letters.length / message.content.length;
            if (upperRatio > 0.7) {
                await message.delete().catch(() => {});
                await applyPunishment(guild, message.author, 'warn');
                logEvent('capslock', guild.id, client.user.id, message.author.id, 'أحرف كبيرة مفرطة');
                return;
            }
        }
    }
    
    // مكافحة المنشن الجماعي
    if (config.protection.anti_massmention) {
        if (message.mentions.users.size > 5) {
            if (!mentionTracker.has(message.author.id)) mentionTracker.set(message.author.id, []);
            const times = mentionTracker.get(message.author.id);
            const now = Date.now();
            times.push(now);
            if (times.length > 10) times.shift();
            const recent = times.filter(t => now - t < 10000);
            if (recent.length >= 3) {
                await message.delete().catch(() => {});
                await applyPunishment(guild, message.author, 'mute');
                logEvent('massmention', guild.id, client.user.id, message.author.id, 'منشن جماعي مفرط');
                return;
            }
        }
    }
});

// ------------------ الحماية: حذف الرسائل (Ghost Ping) ------------------
client.on('messageDelete', async (message) => {
    if (!config.protection.anti_ghostping) return;
    if (!message.guild || !message.author) return;
    if (message.author.bot) return;
    if (isExempt(message.member)) return;
    
    const now = Date.now();
    if (ghostTracker.has(message.id)) {
        const { author, mentions, time } = ghostTracker.get(message.id);
        if (mentions.size > 0 && now - time < 5000) {
            await applyPunishment(message.guild, message.author, 'warn');
            logEvent('ghostping', message.guild.id, client.user.id, message.author.id, 'حذف منشن');
        }
        ghostTracker.delete(message.id);
    }
});

client.on('messageCreate', async (message) => {
    if (message.mentions.users.size > 0 && !message.author.bot && message.guild) {
        ghostTracker.set(message.id, {
            author: message.author,
            mentions: message.mentions.users,
            time: Date.now()
        });
    }
});

// ------------------ الحماية: القنوات ------------------
client.on('channelCreate', async (channel) => {
    if (!config.protection.anti_channel_create) return;
    if (!channel.guild) return;
    const guild = channel.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        await channel.delete().catch(() => {});
        await applyPunishment(guild, entry.executor, 'ban');
        logEvent('channel_create_blocked', guild.id, client.user.id, channel.id, 'محاولة إنشاء قناة');
    }
});

client.on('channelDelete', async (channel) => {
    if (!config.protection.anti_channel_delete) return;
    if (!channel.guild) return;
    const guild = channel.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(guild, entry.executor, 'ban');
        logEvent('channel_delete_blocked', guild.id, client.user.id, channel.id, 'محاولة حذف قناة');
        // استعادة القناة من النسخ الاحتياطي
        await restoreGuild(guild);
    }
});

// ------------------ الحماية: الرتب ------------------
client.on('roleCreate', async (role) => {
    if (!config.protection.anti_role_create) return;
    if (!role.guild) return;
    const guild = role.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleCreate });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        await role.delete().catch(() => {});
        await applyPunishment(guild, entry.executor, 'ban');
        logEvent('role_create_blocked', guild.id, client.user.id, role.id, 'محاولة إنشاء رتبة');
    }
});

client.on('roleDelete', async (role) => {
    if (!config.protection.anti_role_delete) return;
    if (!role.guild) return;
    const guild = role.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(guild, entry.executor, 'ban');
        logEvent('role_delete_blocked', guild.id, client.user.id, role.id, 'محاولة حذف رتبة');
        await restoreGuild(guild);
    }
});

// ------------------ الحماية: الحظر والطرد ------------------
client.on('guildBanAdd', async (ban) => {
    if (!config.protection.anti_ban) return;
    const guild = ban.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        await guild.members.unban(ban.user).catch(() => {});
        await applyPunishment(guild, entry.executor, 'ban');
        logEvent('ban_blocked', guild.id, client.user.id, ban.user.id, 'محاولة حظر');
    }
});

client.on('guildMemberRemove', async (member) => {
    if (!config.protection.anti_kick) return;
    if (!member.guild) return;
    const guild = member.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(guild, entry.executor, 'ban');
        logEvent('kick_blocked', guild.id, client.user.id, member.id, 'محاولة طرد');
    }
});

// ------------------ الحماية: الويبهوك ------------------
client.on('webhookUpdate', async (webhook) => {
    if (!config.protection.anti_webhook) return;
    if (!webhook.guild) return;
    const guild = webhook.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        const webhooks = await guild.fetchWebhooks();
        for (const wh of webhooks.values()) {
            if (wh.createdAt.getTime() > Date.now() - 5000) {
                await wh.delete().catch(() => {});
            }
        }
        await applyPunishment(guild, entry.executor, 'ban');
        logEvent('webhook_blocked', guild.id, client.user.id, webhook.id, 'محاولة إنشاء ويبهوك');
    }
});

// ------------------ الحماية: تغيير النك نيم ------------------
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!config.protection.anti_nick) return;
    if (oldMember.nickname === newMember.nickname) return;
    if (isExempt(newMember)) return;
    const guild = newMember.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        await newMember.setNickname(oldMember.nickname).catch(() => {});
        await applyPunishment(guild, entry.executor, 'warn');
        logEvent('nick_blocked', guild.id, client.user.id, newMember.id, 'محاولة تغيير النك نيم');
    }
});

// ------------------ الحماية: الرابط الدعائي (Vanity) ------------------
client.on('guildUpdate', async (oldGuild, newGuild) => {
    if (!config.protection.anti_vanity) return;
    if (oldGuild.vanityURLCode === newGuild.vanityURLCode) return;
    const auditLogs = await newGuild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.GuildUpdate });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await newGuild.members.fetch(entry.executor.id).catch(() => null))) {
        await newGuild.setVanityCode(oldGuild.vanityURLCode).catch(() => {});
        await applyPunishment(newGuild, entry.executor, 'ban');
        logEvent('vanity_blocked', newGuild.id, client.user.id, newGuild.id, 'محاولة تغيير الرابط الدعائي');
    }
});

// ------------------ الحماية: الإيموجي والملصقات ------------------
client.on('emojiCreate', async (emoji) => {
    if (!config.protection.anti_emoji_create) return;
    if (!emoji.guild) return;
    const guild = emoji.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.EmojiCreate });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        await emoji.delete().catch(() => {});
        await applyPunishment(guild, entry.executor, 'warn');
        logEvent('emoji_create_blocked', guild.id, client.user.id, emoji.id, 'محاولة إنشاء إيموجي');
    }
});

client.on('emojiDelete', async (emoji) => {
    if (!config.protection.anti_emoji_delete) return;
    if (!emoji.guild) return;
    const guild = emoji.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.EmojiDelete });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(guild, entry.executor, 'ban');
        logEvent('emoji_delete_blocked', guild.id, client.user.id, emoji.id, 'محاولة حذف إيموجي');
        await restoreGuild(guild);
    }
});

// ------------------ الحماية: التكاملات (Integrations) ------------------
client.on('guildIntegrationsUpdate', async (guild) => {
    if (!config.protection.anti_integration) return;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.IntegrationCreate });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        await applyPunishment(guild, entry.executor, 'ban');
        logEvent('integration_blocked', guild.id, client.user.id, guild.id, 'محاولة إنشاء تكامل');
    }
});

// ------------------ الحماية: الحظر الجماعي والطرد الجماعي ------------------
client.on('guildMemberRemove', async (member) => {
    // الكشف عن الحظر الجماعي عبر التدقيق
    if (!config.protection.anti_massban && !config.protection.anti_masskick) return;
    const guild = member.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 5 });
    const bans = auditLogs.entries.filter(e => e.action === AuditLogEvent.MemberBanAdd);
    const kicks = auditLogs.entries.filter(e => e.action === AuditLogEvent.MemberKick);
    
    if (config.protection.anti_massban && bans.size >= 3) {
        const executor = bans.first()?.executor;
        if (executor && !isExempt(await guild.members.fetch(executor.id).catch(() => null))) {
            await applyPunishment(guild, executor, 'ban');
            logEvent('massban_blocked', guild.id, client.user.id, executor.id, 'حظر جماعي');
        }
    }
    
    if (config.protection.anti_masskick && kicks.size >= 3) {
        const executor = kicks.first()?.executor;
        if (executor && !isExempt(await guild.members.fetch(executor.id).catch(() => null))) {
            await applyPunishment(guild, executor, 'ban');
            logEvent('masskick_blocked', guild.id, client.user.id, executor.id, 'طرد جماعي');
        }
    }
});

// ------------------ حراسة الصلاحيات ------------------
client.on('guildRoleUpdate', async (oldRole, newRole) => {
    if (!config.protection.permission_guard) return;
    if (isExempt(newRole.guild.members.cache.get(client.user.id))) return;
    const guild = newRole.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleUpdate });
    const entry = auditLogs.entries.first();
    if (entry && entry.executor && !isExempt(await guild.members.fetch(entry.executor.id).catch(() => null))) {
        if (newRole.permissions.bitfield !== oldRole.permissions.bitfield) {
            await newRole.setPermissions(oldRole.permissions).catch(() => {});
            await applyPunishment(guild, entry.executor, 'ban');
            logEvent('permission_guard', guild.id, client.user.id, newRole.id, 'تعديل صلاحيات');
        }
    }
});

// ------------------ لوحة التحكم ويب (Express) ------------------
const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'supreme_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// صفحات الويب
app.get('/', (req, res) => {
    if (!req.session.loggedIn) return res.redirect('/login');
    res.render('dashboard', {
        config: config,
        guilds: client.guilds.cache.map(g => ({ id: g.id, name: g.name, memberCount: g.memberCount })),
        events: eventLog.slice(-100).reverse()
    });
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    if (req.body.password === WEB_PASSWORD) {
        req.session.loggedIn = true;
        return res.redirect('/');
    }
    res.redirect('/login');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// API - تحديث الإعدادات
app.post('/api/config', (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json({ error: 'غير مصرح' });
    const { protection, punishments, exempt_roles } = req.body;
    if (protection) config.protection = { ...config.protection, ...protection };
    if (punishments) {
        for (const [key, val] of Object.entries(punishments)) {
            if (config.punishments[key]) {
                config.punishments[key] = { ...config.punishments[key], ...val };
            }
        }
    }
    if (exempt_roles) config.exempt_roles = exempt_roles;
    saveConfig();
    res.json({ status: 'تم الحفظ' });
});

// API - جلب السجل
app.get('/api/log', (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json({ error: 'غير مصرح' });
    res.json(eventLog.slice(-200).reverse());
});

// API - النسخ الاحتياطي
app.get('/api/backup', (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json({ error: 'غير مصرح' });
    res.json(backupData);
});

// API - استعادة
app.post('/api/restore/:guildId', async (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json({ error: 'غير مصرح' });
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'سيرفر غير موجود' });
    await restoreGuild(guild);
    res.json({ status: 'تمت الاستعادة' });
});

// بدء السيرفر
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`✅ لوحة التحكم تعمل على http://localhost:${PORT}`);
});

// ------------------ تشغيل البوت ------------------
client.login(TOKEN);

// ------------------ ملفات الواجهة (EJS) ------------------
// أنشئ مجلد views وضع فيه:
// 1. login.ejs
// 2. dashboard.ejs

/*
ملف views/login.ejs:
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>تسجيل الدخول</title>
<style>body{background:#1e1e2f;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:#fff;}
.card{background:#2a2a40;padding:40px;border-radius:15px;box-shadow:0 0 30px rgba(0,0,0,0.5);}
input{display:block;width:100%;padding:12px;margin:10px 0;border-radius:8px;border:none;background:#3a3a55;color:#fff;font-size:16px;}
button{width:100%;padding:12px;background:#4CAF50;border:none;border-radius:8px;color:#fff;font-size:18px;cursor:pointer;}
h1{text-align:center;}</style>
</head>
<body>
<div class="card"><h1>🛡️ نظام الحماية</h1>
<form method="post"><input type="password" name="password" placeholder="كلمة المرور"><button type="submit">دخول</button></form></div>
</body>
</html>
*/

/*
ملف views/dashboard.ejs:
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>لوحة التحكم</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#0d0d1a;color:#e0e0e0;font-family:'Segoe UI',sans-serif;padding:20px;}
.header{display:flex;justify-content:space-between;align-items:center;padding:15px 30px;background:#1a1a2e;border-radius:12px;margin-bottom:25px;}
.card{background:#1e1e32;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 4px 15px rgba(0,0,0,0.4);}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;}
.switch{position:relative;display:inline-block;width:48px;height:24px;}
.switch input{opacity:0;width:0;height:0;}
.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#555;transition:.3s;border-radius:24px;}
.slider:before{content:"";position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#fff;transition:.3s;border-radius:50%;}
input:checked+.slider{background:#4CAF50;}
input:checked+.slider:before{transform:translateX(24px);}
.label-item{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:6px 12px;background:#2a2a44;border-radius:8px;}
.btn{background:#4CAF50;border:none;padding:8px 18px;border-radius:8px;color:#fff;cursor:pointer;font-size:14px;transition:.2s;}
.btn:hover{opacity:0.8;}
.btn-danger{background:#e74c3c;}
.log-box{background:#0a0a15;height:300px;overflow-y:auto;padding:10px;border-radius:8px;font-family:monospace;font-size:13px;}
.log-entry{border-bottom:1px solid #2a2a44;padding:4px 0;}
.exempt-input{width:100%;padding:10px;background:#2a2a44;border:1px solid #444;border-radius:8px;color:#fff;margin:10px 0;}
</style>
</head>
<body>
<div class="header"><h1>🛡️ نظام الحماية الشامل</h1><a href="/logout" class="btn btn-danger">تسجيل خروج</a></div>
<div class="card"><h3>السيرفرات: <%= guilds.map(g=>g.name).join(', ') %></h3></div>

<div class="card"><h3>⚙️ الحماية</h3><div class="grid" id="protectionGrid"></div></div>

<div class="card"><h3>⚖️ العقوبات</h3><div id="punishmentConfig"></div></div>

<div class="card"><h3>🔑 رتب الاستثناء (معرفات)</h3>
<input class="exempt-input" id="exemptInput" placeholder="مثال: 123456789,987654321">
<button class="btn" onclick="updateExempt()">تحديث</button></div>

<div class="card"><h3>📋 سجل الأحداث (آخر 200)</h3>
<div class="log-box" id="logBox"></div>
<button class="btn" onclick="fetchLogs()" style="margin-top:10px;">تحديث السجل</button>
<button class="btn btn-danger" onclick="restoreAll()">استعادة الكل</button></div>

<script>
const config = <%- JSON.stringify(config) %>;
function renderProtection() {
    const grid = document.getElementById('protectionGrid');
    grid.innerHTML = '';
    for (const [key, val] of Object.entries(config.protection)) {
        grid.innerHTML += `<div class="label-item"><span>${key.replace(/_/g,' ')}</span>
        <label class="switch"><input type="checkbox" ${val?'checked':''} onchange="toggle('${key}',this.checked)"><span class="slider"></span></label></div>`;
    }
}
function renderPunishments() {
    const div = document.getElementById('punishmentConfig');
    div.innerHTML = '';
    for (const [p, opts] of Object.entries(config.punishments)) {
        let html = `<div style="background:#2a2a44;padding:10px;border-radius:8px;margin:5px 0;"><strong>${p}</strong>`;
        for (const [k, v] of Object.entries(opts)) {
            if (typeof v === 'boolean') {
                html += `<div class="label-item"><span>${k}</span>
                <label class="switch"><input type="checkbox" ${v?'checked':''} onchange="updatePun('${p}','${k}',this.checked)"><span class="slider"></span></label></div>`;
            } else {
                html += `<div><span>${k}: </span><input type="number" value="${v}" style="background:#3a3a55;border:none;color:#fff;padding:5px;border-radius:5px;width:80px;" onchange="updatePun('${p}','${k}',this.value)"></div>`;
            }
        }
        html += '</div>';
        div.innerHTML += html;
    }
}
async function toggle(key, val) {
    await fetch('/api/config', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protection:{[key]:val}})});
}
async function updatePun(cat, key, val) {
    const payload = {punishments:{[cat]:{[key]: val}}};
    await fetch('/api/config', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
}
async function updateExempt() {
    const val = document.getElementById('exemptInput').value.split(',').map(s=>s.trim()).filter(Boolean).map(Number);
    await fetch('/api/config', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exempt_roles:val})});
}
async function fetchLogs() {
    const res = await fetch('/api/log');
    const logs = await res.json();
    const box = document.getElementById('logBox');
    box.innerHTML = logs.map(l => `<div class="log-entry">${new Date(l.time).toLocaleString()} | ${l.type} | مستخدم:${l.user} | هدف:${l.target} | ${l.detail}</div>`).join('');
}
async function restoreAll() {
    const guilds = <%- JSON.stringify(guilds.map(g=>g.id)) %>;
    for (const id of guilds) {
        await fetch(`/api/restore/${id}`, {method:'POST'});
    }
    alert('تمت الاستعادة لجميع السيرفرات');
}
document.getElementById('exemptInput').value = (config.exempt_roles || []).join(',');
renderProtection();
renderPunishments();
fetchLogs();
setInterval(fetchLogs, 5000);
</script>
</body>
</html>
*/

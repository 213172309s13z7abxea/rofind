const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot is alive!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || null;

if (!TOKEN || !CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName('avatar').setDescription('Show Roblox avatar headshot').addStringOption(opt => opt.setName('user').setDescription('Roblox username or user id').setRequired(true)),
  new SlashCommandBuilder().setName('user').setDescription('Mention a Discord user and show Roblox avatar').addUserOption(opt => opt.setName('discord').setDescription('Discord user to mention').setRequired(true)).addStringOption(opt => opt.setName('roblox').setDescription('Roblox username or id').setRequired(true)),
  new SlashCommandBuilder().setName('donotax').setDescription('Donate amount (40% tax)').addNumberOption(opt => opt.setName('amount').setDescription('Amount (number)').setRequired(true)),
  new SlashCommandBuilder().setName('gamepasstax').setDescription('Gamepass donation (30% tax)').addNumberOption(opt => opt.setName('amount').setDescription('Amount (number)').setRequired(true)),
  new SlashCommandBuilder().setName('userinfo').setDescription('Detailed Roblox user info embed').addStringOption(opt => opt.setName('user').setDescription('Roblox username or user id').setRequired(true)),
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering slash commands...');
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('Registered guild commands.');
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Registered global commands (may take up to an hour to appear).');
    }
  } catch (err) {
    console.error('Error registering commands', err);
  }
}

// ---------- Roblox helper functions ----------
async function usernameToId(name) {
  if (/^\d+$/.test(name)) return parseInt(name, 10);
  const res = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [name] }).catch(() => null);
  if (!res || !res.data || !res.data.data || res.data.data.length === 0) return null;
  return res.data.data[0].id;
}

async function getUserById(id) {
  const res = await axios.get(`https://users.roblox.com/v1/users/${id}`).catch(() => null);
  return res ? res.data : null;
}

async function getHeadshotUrl(id, size = '420x420') {
  const res = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=${size}&format=Png&isCircular=false`).catch(() => null);
  if (!res || !res.data || !res.data.data || res.data.data.length === 0) return null;
  return res.data.data[0].imageUrl;
}

async function getFriendsCount(id) {
  const res = await axios.get(`https://friends.roblox.com/v1/users/${id}/friends/count`).catch(() => null);
  return res && res.data ? res.data.count ?? null : null;
}

async function getFollowersCount(id) {
  const res = await axios.get(`https://friends.roblox.com/v1/users/${id}/followers/count`).catch(() => null);
  return res && res.data ? res.data.count ?? null : null;
}

async function getFollowingsCount(id) {
  const res = await axios.get(`https://friends.roblox.com/v1/users/${id}/followings/count`).catch(() => null);
  return res && res.data ? res.data.count ?? null : null;
}

async function getPresence(id) {
  const res = await axios.post('https://presence.roblox.com/v1/presence/users', { userIds: [id] }).catch(() => null);
  if (!res || !res.data || !res.data.userPresences || res.data.userPresences.length === 0) return null;
  return res.data.userPresences[0];
}

async function getProfileInfo(id) {
  const res = await axios.get(`https://users.roblox.com/v1/users/${id}`).catch(() => null);
  const profile = res && res.data ? res.data : null;
  const descRes = await axios.get(`https://users.roblox.com/v1/users/${id}/profile`).catch(() => null);
  const profileData = descRes && descRes.data ? descRes.data : null;
  return { profile, profileData };
}

async function getGroupsCount(id) {
  const res = await axios.get(`https://groups.roblox.com/v1/users/${id}/groups/roles`).catch(() => null);
  return res && res.data ? res.data.length : 0;
}
// ---------- end roblox helpers ----------

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.User]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const name = interaction.commandName;

  try {
    if (name === 'avatar') {
      await interaction.deferReply();
      const userInput = interaction.options.getString('user', true);
      const id = await usernameToId(userInput);
      if (!id) return interaction.editReply('Could not find that Roblox user.');
      const url = await getHeadshotUrl(id);
      if (!url) return interaction.editReply('Could not fetch avatar headshot.');
      return interaction.editReply({ content: url });
    }

    if (name === 'user') {
      await interaction.deferReply();
      const discordUser = interaction.options.getUser('discord', true);
      const robloxInput = interaction.options.getString('roblox', true);
      const id = await usernameToId(robloxInput);
      if (!id) return interaction.editReply('Could not find that Roblox user.');
      const url = await getHeadshotUrl(id);
      const mention = `<@${discordUser.id}>`;
      return interaction.editReply({ content: `${mention} ${url}` });
    }

    if (name === 'donotax' || name === 'gamepasstax') {
      const amount = interaction.options.getNumber('amount', true);
      const tax = name === 'donotax' ? 0.40 : 0.30;
      const net = amount * (1 - tax);
      const fmt = (n) => (Number.isInteger(n) ? n : Number(n.toFixed(2)));
      return interaction.reply({
        content: `${name === 'donotax' ? 'Donate (donation tax 40%)' : 'Gamepass donation (tax 30%)'}\nOriginal: ${fmt(amount)} → After ${tax * 100}% tax: ${fmt(net)}`
      });
    }

    if (name === 'userinfo') {
      await interaction.deferReply();
      const userInput = interaction.options.getString('user', true);
      const id = await usernameToId(userInput);
      if (!id) return interaction.editReply('Could not find that Roblox user.');

      const [userInfo, headshot, friends, followers, followings, presence, profileInfo] = await Promise.all([
        getUserById(id),
        getHeadshotUrl(id, '720x720'),
        getFriendsCount(id),
        getFollowersCount(id),
        getFollowingsCount(id),
        getPresence(id),
        getProfileInfo(id)
      ]);

      if (!userInfo) return interaction.editReply('Could not fetch user info.');

      const displayName = userInfo.displayName || userInfo.username;
      const username = userInfo.name || userInfo.username || userInput;
      const profileUrl = `https://roblox.com/users/${id}/profile`;
      const friendsStr = friends ?? 'N/A';
      const followersStr = followers ?? 'N/A';
      const followingStr = followings ?? 'N/A';
      const verified = userInfo.hasVerifiedBadge ? 'Yes' : 'No';
      const premium = userInfo.isPremium ? 'Yes' : 'No';
      const badgesCount = 0; // removed broken badges
      const groupsCount = await getGroupsCount(id);
      const inventoryPrivacy = profileInfo?.profileData?.isInventoryPrivate ? 'Private' : 'Public';
      const description = profileInfo?.profileData?.blurb || profileInfo?.profile?.description || 'No description';
      const rapMaskedText = `[Check RAP](https://www.rolimons.com/player/${id})`;
      const valueMaskedText = `[Check Value](https://www.rolimons.com/player/${id})`;
      const created = userInfo.created ? new Date(userInfo.created).toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
      const timestamp = new Date().toLocaleString('en-GB');

      const embed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle(`${displayName} (${username})`)
        .setURL(profileUrl)
        .addFields(
          { name: '  ', value: `**Friends** ${friendsStr} | **Followers** ${followersStr} | **Following** ${followingStr}`, inline: false },
          { name: 'User ID', value: `${id}`, inline: true },
          { name: 'Verified', value: verified, inline: true },
          { name: 'Premium', value: premium, inline: true },
          { name: 'Badges Count', value: `${badgesCount}`, inline: true },
          { name: 'Group Count', value: `${groupsCount}`, inline: true },
          { name: 'Inventory Privacy', value: inventoryPrivacy, inline: true },
          { name: 'Description', value: description, inline: false },
          { name: 'RAP', value: rapMaskedText, inline: true },
          { name: 'Value', value: valueMaskedText, inline: true },
          { name: 'Account Created', value: created, inline: false },
        )
        .setImage(headshot || undefined)
        .setFooter({ text: `Data fetched: ${timestamp}` });

      return interaction.editReply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('Command error:', err);
    if (interaction.deferred || interaction.replied) {
      interaction.editReply('Something went wrong while processing your request.');
    } else {
      interaction.reply('Something went wrong while processing your request.');
    }
  }
});

(async () => {
  await registerCommands();
  await client.login(TOKEN);
})();

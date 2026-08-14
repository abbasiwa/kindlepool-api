import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } from 'discord.js'
import { KindlePoolAPI } from '@kindlepool/sdk'

const TOKEN = process.env.DISCORD_BOT_TOKEN
const CLIENT_ID = process.env.DISCORD_CLIENT_ID
const API_KEY = process.env.KINDPOOL_API_KEY ?? ''

if (!TOKEN) {
  console.error('DISCORD_BOT_TOKEN is required')
  process.exit(1)
}
if (!CLIENT_ID) {
  console.error('DISCORD_CLIENT_ID is required')
  process.exit(1)
}

const api = new KindlePoolAPI({ apiKey: API_KEY })

const commands = [
  new SlashCommandBuilder()
    .setName('trending')
    .setDescription('Show trending KindlePool pools')
    .addIntegerOption((o) => o.setName('limit').setDescription('Number of pools').setMinValue(1).setMaxValue(10)),

  new SlashCommandBuilder()
    .setName('pool')
    .setDescription('Show pool details')
    .addIntegerOption((o) => o.setName('id').setDescription('Pool ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('funded')
    .setDescription('Show pools funded by an address')
    .addStringOption((o) => o.setName('address').setDescription('Stellar address').setRequired(true)),
]

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`)

  const rest = new REST({ version: '10' }).setToken(TOKEN)
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map((c) => c.toJSON()) })
    console.log('Slash commands registered')
  } catch (err) {
    console.error('Failed to register commands:', err)
  }
})

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  await interaction.deferReply()

  try {
    switch (interaction.commandName) {
      case 'trending': {
        const limit = interaction.options.getInteger('limit') ?? 5
        const pools = await api.listPools({ sort: 'most_funded', limit })
        const lines = pools.data.map((p) => `**#${p.id}** — ${p.total_deposited}/${p.goal} USDC (${p.status})`)
        await interaction.editReply(lines.length > 0 ? lines.join('\n') : 'No pools found.')
        break
      }
      case 'pool': {
        const id = interaction.options.getInteger('id', true)
        const pool = await api.getPool(id)
        await interaction.editReply(
          `**Pool #${pool.id}**\nStatus: ${pool.status}\nFunding: ${pool.total_deposited}/${pool.goal} USDC\nSupporters: ${pool.total_supporters}\nCreator: ${pool.creator.slice(0, 8)}...\n<https://kindlepool.app/pool/${pool.id}>`
        )
        break
      }
      case 'funded': {
        const address = interaction.options.getString('address', true)
        const pools = await api.getPoolsBySupporter(address)
        const lines = pools.data.map((p) => `**#${p.id}** — ${p.status} — ${p.total_deposited}/${p.goal} USDC`)
        await interaction.editReply(lines.length > 0 ? lines.join('\n') : 'No pools funded by this address.')
        break
      }
    }
  } catch (err: any) {
    await interaction.editReply(`Error: ${err.message}`)
  }
})

client.login(TOKEN)

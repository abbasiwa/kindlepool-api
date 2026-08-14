const { Keypair, TransactionBuilder, Operation, Networks, Asset, Horizon } = require('@stellar/stellar-sdk')

const ISSUER = 'GB66J75BOHQFPAVUUEESNKMZERATD7GMZYUVZIIDFD2GR56EMOSUYAOQ'
const SECRETS = {
  'GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA': 'SDBDCH4I5ZOR7DGC32T3HENYTC5LIEN4SFS3YFAI2GNLJUHS3WCLTXLH',
  'GA4HESRPSVM7PLTCJOC5OTA2FNZIUKG5EJ5W6EAVSHEH52VNLFY7AVHA': 'SBS7UJE4NAXP5F5PG65SUTIWGYSRXITFDJHR3R5FQTB7YW3MQFO2FSVX',
  'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP': 'SANCKHICFGUTPC6TUX7JE5KKD6IA3YYSA7R642IUNKTVQSYEW4FXHXX2',
  'GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D': 'SAAYU2FUCRXCHJ33BDRG22HJDUPADLAAJCS6DMWXMXZXIJTVQT35WO7P',
}

const server = new Horizon.Server('https://horizon-testnet.stellar.org')

async function main() {
  for (const [pub, secret] of Object.entries(SECRETS)) {
    const kp = Keypair.fromSecret(secret)
    const account = await server.loadAccount(pub)
    const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.changeTrust({ asset: new Asset('USDC', ISSUER), limit: '10000000000' }))
      .setTimeout(300)
      .build()
    tx.sign(kp)
    const res = await server.submitTransaction(tx)
    console.log('Trustline created for', pub.slice(0, 8), res.hash)
  }
}

main().catch(e => console.error('FAILED:', e.message || e))

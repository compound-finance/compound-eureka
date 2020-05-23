import Etherscan from '@compound-finance/etherscan';
import path from 'path';

let [_node, _file, network, name, address] = process.argv;

let networks = ['development', 'ropsten', 'rinkeby', 'kovan', 'goerli', 'mainnet'];

if (
  !network ||
  !networks.includes(network) ||
  !name ||
  !address ||
  address.slice(0, 2) !== '0x'
) {
  console.log("usage: <network> <token_name> <address>\n\n");
  process.exit(1);
}

let outdir = path.join(process.cwd(), './.build');
let outname = `${name}.json`;
let verbose = 3;

(async function() {
  let prefix = network === 'mainnet' ? '' : `${network}.`;
  console.log(`\nImporting ${name} from https://${prefix}etherscan.io/address/${address}\n`);
  await Etherscan.importContract(network, address, outdir, outname, verbose);
  console.log(`\nSuccessfully imported ${outdir}/${outname}\n`);
})();

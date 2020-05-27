import Etherscan from '@compound-finance/etherscan';
import path from 'path';

let [_node, _file, network, outname, ...addresses] = process.argv;

let networks = ['development', 'ropsten', 'rinkeby', 'kovan', 'goerli', 'mainnet'];

function printUsage() {
  console.log("usage: <network> <outname> <address..>\n\n");
  process.exit(1);
}

if (!network || !networks.includes(network) || !outname || addresses.length === 0) {
  printUsage();
}

addresses.forEach((address) => {
  if (!address || address.slice(0, 2) !== '0x') {
    printUsage();
  }
});

let outdir = path.join(process.cwd(), './.build');
outname = outname.includes('.') ? outname : `${outname}.json`;
let outfile = path.join(outdir, outname);
let verbose = 3;

(async function() {
  let prefix = network === 'mainnet' ? '' : `${network}.`;
  let etherscanUrls = addresses.map((address) => `https://${prefix}etherscan.io/address/${address}`);
  console.log(`\nImporting ${outname} from ${etherscanUrls.join(' ')}\n`);
  await Etherscan.importContract(network, addresses, outfile, { apikey: process.env['etherscan'] });
  console.log(`\nSuccessfully imported ${outfile}\n`);
})();

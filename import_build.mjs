import { importContract } from 'saddle';

let source = 'etherscan';
let network = 'kovan';
let address = '0x';
let outdir = path.join(process.cwd(), './build');
let verbose = 3;

(async function() {
  console.log("Importing something...");
  await importContract(source, network, address, outdir, verbose);
  console.log("Done...");
})();


hook('state.save', async (state) => {
  // We wrap this in a try since if it fails, we can always re-run with `refresh` command
  try {
    const readFile = (file) => util.promisify(fs.readFile)(file, 'utf8');
    const readDir = (file) => util.promisify(fs.readdir)(file, 'utf8');
    const fileExists = util.promisify(fs.exists);
    const writeFile = util.promisify(fs.writeFile);
    let stateEntries = Object.entries(state);

    // TODO: Better handle build dir
    let buildDir = path.join(process.cwd(), '.build');
    let refMapFile = path.join(process.cwd(), 'refMap.json');
    let refMap = JSON.parse(await readFile(refMapFile));

    if (!await fileExists(buildDir)) {
      throw new Error(`Cannot find build dir: ${buildDir}`);
    }

    let files = await readDir(buildDir);

    // Note: we don't properly handle multiple contracts with the
    // same name, here.
    let versions = await files.reduce(async (acc_, file) => {
      let acc = await acc_;
      let contents = await readFile(path.join(buildDir, file));
      let build = JSON.parse(contents);
      let [version, ...rest] = file.split('.');
      let abis = Object.fromEntries(Object.entries(build.contracts).map(([k, {abi}]) => {
        let abiJson = typeof(abi) === 'string' ? JSON.parse(abi) : abi;

        return [k.split(':')[1], abiJson];
      }));

      return {
        ...acc,
        [version]: abis
      };
    }, {});
    // console.log(`Versions: ${JSON.stringify(Object.keys(versions))}`);

    let abis = stateEntries.reduce((acc, [ref, contract]) => {
      let r = refMap.hasOwnProperty(ref) ? refMap[ref] : ref;
      let version = versions[contract.version];
      if (!version) {
        throw new Error(`No build to match ${contract.version} for ref #${ref}`);
      }
      if (!contract.deployment) {
        return acc; // Nothing to do here if we don't have a deployment
      }
      let deployedContract = contract.deployment.contract;
      let abi = version[deployedContract];
      if (!abi) {
        throw new Error(`Cannot find ${deployedContract} in version ${contract.version}`);
      }

      return {
        ...acc,
        [r]: abi
      };
    }, {});

    // Comptroller is special
    abis.Comptroller = [
      ...abis.Unitroller,
      ...abis.StdComptroller
    ];

    let networkAbiFile = path.join(process.cwd(), 'networks', `${network}-abi.json`);
    await writeFile(networkAbiFile, JSON.stringify(abis, null, 2));

    console.log(`Saved networks ABI file: ${networkAbiFile}`);
  } catch (e) {
    console.error(e);
    console.log(`Error saving networks ABI file: ${e.toString()}\n`);
  }
});

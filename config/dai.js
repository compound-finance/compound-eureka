
define('Erc20', {
  contract: 'Dai',
  match: {
    properties: {
      'dai': true
    }
  },
  properties: {
    dai: 'bool',
    address: 'address'
  },
  build: async ({existing}, contract, {address}) => existing(contract, address)
});

define('Pot', {
  contract: 'Pot',
  properties: {
    address: 'address'
  },
  build: async ({existing}, contract, {address}) => existing(contract, address)
});

define('Jug', {
  contract: 'Jug',
  properties: {
    address: 'address'
  },
  build: async ({existing}, contract, {address}) => existing(contract, address)
});

define('CDaiDelegate', {
  contract: 'CDaiDelegate',
  build: async ({deploy}, contract, props) => deploy(contract)
});

define('InterestRateModel', {
  match: {
    properties: {
      type: 'dsr'
    }
  },
  contract: 'DAIInterestRateModelV2',
  properties: {
    type: 'string',
    jump: 'number',
    kink: 'number',
    pot: { ref: 'Pot' },
    jug: { ref: 'Jug' }
  },
  build: ({deploy}, contract, {jump, kink, pot, jug}) =>
    deploy(contract, {
      jumpMultiplierPerYear: jump,
      kink_: kink,
      pot_: pot,
      jug_: jug
    })
});


define('CrowdProposalFactory', {
  properties: {
    comp: {ref: 'Comp'},
    governor: {ref: 'Governor'},
    stake_amount: 'number'
  },
  build: async ({deploy, ethereum}, contract, { comp, governor, stake_amount }) => {
    return deploy(contract, {
      comp_: comp,
      governor_: governor,
      compStakeAmount_: stake_amount
    });
  }
});

const { aggregatorNode, checkChildrenGreen } = require('./aggregator');

async function test() {
  const parentBranch = 'main';
  const childBranches = ['feature/A', 'feature/B'];

  try {
    await aggregatorNode(parentBranch, childBranches);
    console.log("Success");
  } catch (error) {
    console.error("Aggregator Node failed:", error);
  }
}

test();

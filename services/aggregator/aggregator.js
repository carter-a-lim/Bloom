const { exec } = require('child_process');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'dummy_key',
});

function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve({ error, stdout, stderr });
      } else {
        resolve({ error: null, stdout, stderr });
      }
    });
  });
}

/**
 * Checks if all child nodes hit the 'Green' state by actually running `npm test` on them.
 */
async function checkChildrenGreen(branches) {
  console.log(`Checking if branches are in 'Green' state: ${branches.join(', ')}`);

  // Save current branch
  const { stdout: currentBranchOut } = await runCommand('git branch --show-current');
  const currentBranch = currentBranchOut.trim() || 'main';

  for (const branch of branches) {
    console.log(`Checking status for branch: ${branch}`);
    // Check out branch
    const { error: checkoutErr } = await runCommand(`git checkout ${branch}`);
    if (checkoutErr) {
      console.error(`Could not checkout branch ${branch}.`);
      await runCommand(`git checkout ${currentBranch}`); // restore
      return false;
    }

    // Run tests
    const { error: testErr, stdout, stderr } = await runCommand('npm test');
    if (testErr) {
      console.error(`Branch ${branch} is NOT green. Tests failed:`, stderr || stdout);
      await runCommand(`git checkout ${currentBranch}`); // restore
      return false;
    }
    console.log(`Branch ${branch} passed tests.`);
  }

  // Restore back to original branch
  await runCommand(`git checkout ${currentBranch}`);
  return true;
}

/**
 * Gathers diffs from child worktrees/branches relative to the parent branch.
 */
async function gatherDiffs(parentBranch, branches) {
  const diffs = {};
  for (const branch of branches) {
    const { stdout, error } = await runCommand(`git diff ${parentBranch}...${branch}`);
    if (error) {
        console.error(`Failed to get diff for ${branch}:`, error);
        throw new Error(`Failed to get diff for ${branch}`);
    }
    diffs[branch] = stdout;
  }
  return diffs;
}

/**
 * Uses an LLM to review diffs and suggest a resolution to logical conflicts.
 * The LLM is asked to output standard patch blocks which we can apply or use to rewrite files.
 */
async function resolveLogicalConflictsWithLLM(parentBranch, childBranches, diffs) {
  console.log('Sending diffs to LLM for proactive review of logical conflicts...');

  const diffsText = Object.entries(diffs)
    .map(([branch, diff]) => `--- Branch: ${branch} ---\n${diff}`)
    .join('\n\n');

  const prompt = `
You are an expert software developer. The following are git diffs of feature branches against '${parentBranch}'.
Please review them for logical conflicts (e.g. changing the same behavior in incompatible ways).
If you see a logical conflict that git merge might miss (i.e. it merges cleanly but the logic is broken), explain what it is and how to fix it.

If there are no logical conflicts, reply exactly with: "NO_LOGICAL_CONFLICTS".

If there ARE logical conflicts, provide a bash script to fix them. The bash script must be enclosed in standard markdown shell blocks, like this:
\`\`\`bash
# your fix script here
\`\`\`
The bash script should use commands like \`sed\`, \`echo\`, or \`cat << 'EOF' > file\` to directly modify the codebase. Assume the script runs from the repository root.
Do not output anything else if you provide a script.

Diffs:
${diffsText}
`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      temperature: 0,
      system: "You are an expert developer reviewing code for logical conflicts and providing bash script fixes.",
      messages: [
        { role: "user", content: prompt }
      ]
    });

    const text = response.content[0].text.trim();
    if (text === "NO_LOGICAL_CONFLICTS") {
        return null; // no script needed
    }

    // Extract bash script from markdown blocks
    const match = text.match(/```(?:bash|sh)\n([\s\S]*?)\n```/);
    if (match && match[1]) {
        return match[1];
    }

    // Fallback if the LLM didn't format it right but we know it gave something
    return null;
  } catch (error) {
    console.error("Error communicating with LLM for logical conflicts:", error);
    return null;
  }
}

/**
 * Helper to resolve physical git conflicts in a file using the LLM.
 */
async function resolveFileConflictWithLLM(filename, fileContent) {
    const prompt = `
You are an expert software developer. The following file has git merge conflicts.
Please resolve the conflicts cleanly. Provide ONLY the final resolved file content, with no markdown code blocks formatting or explanations. Just the raw text of the resolved file.

File: ${filename}
Content:
${fileContent}
`;

    try {
        const response = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 4096,
            temperature: 0,
            system: "You are an expert developer resolving git merge conflicts. Output ONLY the raw resolved file content.",
            messages: [
                { role: "user", content: prompt }
            ]
        });
        return response.content[0].text.trim();
    } catch (error) {
        console.error("Error resolving conflict with LLM:", error);
        throw error;
    }
}

/**
 * Aggregator node logic:
 * 1. Checks if child branches are 'Green'
 * 2. Saves parent branch original commit hash for safe rollback
 * 3. Gathers diffs & uses LLM to review for logical conflicts ahead of time
 * 4. Actually merges the branches, using LLM to resolve physical conflicts if they occur
 * 5. Applies any logical conflict resolutions provided by the LLM
 * 6. Runs npm test to verify
 * 7. Finalizes merge
 */
async function aggregatorNode(parentBranch, childBranches) {
  console.log(`Starting Aggregator Node...`);
  console.log(`Parent branch: ${parentBranch}`);
  console.log(`Child branches: ${childBranches.join(', ')}`);

  // 1. Check if all child nodes/branches are 'Green'
  const allGreen = await checkChildrenGreen(childBranches);
  if (!allGreen) {
    throw new Error('Not all child branches are in a Green state. Aborting merge.');
  }
  console.log('All child branches are Green.');

  // Check out parent branch
  await runCommand(`git checkout ${parentBranch}`);

  // 2. Save original head hash for safe rollback
  const { stdout: headHashOut } = await runCommand(`git rev-parse HEAD`);
  const originalHeadHash = headHashOut.trim();
  console.log(`Saved original parent branch commit hash for potential rollback: ${originalHeadHash}`);

  // 3. Gather diffs for LLM review
  const diffs = await gatherDiffs(parentBranch, childBranches);

  let hasChanges = false;
  for (const diff of Object.values(diffs)) {
      if (diff.trim().length > 0) hasChanges = true;
  }

  let logicalFixScript = null;

  if (hasChanges) {
      // Proactive logical conflict review
      logicalFixScript = await resolveLogicalConflictsWithLLM(parentBranch, childBranches, diffs);
  }

  // 4. Actually merge branches
  for (const branch of childBranches) {
     console.log(`Merging ${branch} into ${parentBranch}...`);

     // Use --no-ff to ensure merge commits are created
     const { error: mergeErr, stdout, stderr } = await runCommand(`git merge --no-edit --no-ff ${branch}`);

     if (mergeErr) {
         if (stdout.includes('CONFLICT') || stderr.includes('CONFLICT') || stdout.includes('Automatic merge failed')) {
             console.log(`Merge conflicts detected when merging ${branch}. Using LLM to resolve...`);

             // Get conflicted files
             const { stdout: unmergedOut } = await runCommand(`git diff --name-only --diff-filter=U`);
             const conflictedFiles = unmergedOut.split('\n').map(f => f.trim()).filter(f => f.length > 0);

             for (const file of conflictedFiles) {
                 console.log(`Resolving conflict in ${file}...`);
                 const content = fs.readFileSync(file, 'utf-8');
                 const resolvedContent = await resolveFileConflictWithLLM(file, content);

                 // Write resolved content and add to git
                 fs.writeFileSync(file, resolvedContent, 'utf-8');
                 await runCommand(`git add ${file}`);
             }

             // Commit the resolved merge
             const { error: commitErr, stderr: commitStderr } = await runCommand(`git commit -m "Merge ${branch} and resolve conflicts via LLM"`);
             if (commitErr) {
                 await runCommand(`git merge --abort`);
                 throw new Error(`Failed to commit resolved conflicts: ${commitStderr}`);
             }
             console.log(`Successfully resolved conflicts and merged ${branch}.`);
         } else {
             await runCommand(`git merge --abort`);
             throw new Error(`Failed to merge ${branch}: ${stderr || stdout}`);
         }
     } else {
         console.log(`Successfully merged ${branch} cleanly.`);
     }
  }

  // 5. Apply any logical conflict resolutions
  if (logicalFixScript) {
      console.log('Applying logical conflict fixes provided by LLM...');
      fs.writeFileSync('llm_logical_fix.sh', logicalFixScript);
      const { error: fixErr, stdout: fixOut, stderr: fixErrOut } = await runCommand(`bash llm_logical_fix.sh`);

      if (fixErr) {
          console.warn(`Failed to apply logical fixes automatically. Proceeding anyway, tests might fail. Err: ${fixErrOut || fixOut}`);
      } else {
          console.log('Successfully applied logical conflict fixes.');
          // Commit the fixes
          await runCommand(`git add .`);
          const { stdout: statusOut } = await runCommand(`git status --porcelain`);
          if (statusOut.trim().length > 0) {
              await runCommand(`git commit -m "Apply LLM logical conflict resolutions"`);
          }
      }
      // cleanup script
      fs.unlinkSync('llm_logical_fix.sh');
  } else {
      console.log('No logical conflict fixes needed.');
  }

  // 6. Run `npm test` before finalizing
  console.log('Running tests to verify merged state...');
  const testResult = await runCommand('npm test');

  if (testResult.error) {
      console.error('Tests failed after applying merges. Aborting.');
      console.error(testResult.stderr || testResult.stdout);

      // Safe Rollback to original commit hash
      console.log(`Rolling back merge to original commit hash: ${originalHeadHash}`);
      await runCommand(`git reset --hard ${originalHeadHash}`);

      throw new Error('Tests failed after merge. Merges have been reverted safely.');
  }

  console.log('Tests passed successfully.');

  // 7. Finalize merge
  console.log('Finalizing merge (ready for push).');
  // In a real pipeline, we might do `await runCommand('git push origin ${parentBranch}')` here.

  console.log(`Aggregator node completed successfully. Merged ${childBranches.join(', ')} into ${parentBranch}.`);
  return true;
}

module.exports = {
  aggregatorNode,
  checkChildrenGreen,
  gatherDiffs,
  resolveLogicalConflictsWithLLM
};

// HTTP server so the worker can trigger aggregation
const express = require('express');
const aggregatorApp = express();
aggregatorApp.use(express.json());

aggregatorApp.post('/aggregate', async (req, res) => {
  const { parentBranch, childBranches } = req.body;
  if (!parentBranch || !Array.isArray(childBranches) || childBranches.length === 0) {
    return res.status(400).json({ error: 'Missing parentBranch or childBranches' });
  }
  try {
    await aggregatorNode(parentBranch, childBranches);
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const AGGREGATOR_PORT = process.env.AGGREGATOR_PORT || 3002;
aggregatorApp.listen(AGGREGATOR_PORT, () => {
  console.log(`Aggregator service listening at http://localhost:${AGGREGATOR_PORT}`);
});

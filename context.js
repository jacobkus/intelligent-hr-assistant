// Learn more about using dynamic variables: https://promptfoo.dev/docs/configuration/guide/#import-vars-from-separate-files
module.exports = (varName, prompt, otherVars) => {
  // This is where you can fetch documents from a database, call an API, etc.
  // ...

  if (varName === "context") {
    // Return value based on the variable name and test context
    return {
      output: `... Documents for ${otherVars.inquiry} for prompt: ${prompt} ...`,
    };
  }

  // Default variable value
  return {
    output: "Document A, Document B, Document C, ...",
  };

  // Handle potential errors
  // return { error: 'Error message' }
};

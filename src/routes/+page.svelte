<script>
    // Default example data and code
    let dataInput = `[
    { "name": "Alice", "age": 30 },
    { "name": "Bob", "age": 25 },
    { "name": "Charlie", "age": 35 }
  ]`;
    let codeInput = `data.filter(d => d.age > 28)`;
    let output = "";
    let error = "";
    
    // View modes for input and output
    let inputView = "json";   // "json" or "table"
    let outputView = "json";  // "json" or "table"
  
    // Run the code: parse input JSON, execute the code, then stringify the result.
    function runCode() {
      error = "";
      try {
        // Parse the input data
        let data = JSON.parse(dataInput);
        
        // Create a function that gets data (and tidy if available) in scope.
        // The user’s code is expected to be an expression that returns a value.
        const fn = new Function('data', 'tidy', `return (${codeInput})`);
        // If you have tidy.js loaded globally, it will be passed; otherwise undefined.
        let result = fn(data, typeof tidy !== 'undefined' ? tidy : undefined);
        
        // Convert the result to a formatted JSON string for display.
        output = JSON.stringify(result, null, 2);
      } catch (e) {
        error = e.toString();
        output = "";
      }
    }
  
    // Reactive: try to parse the input as JSON for table view.
    $: dataTableParsed = (() => {
      try {
        const parsed = JSON.parse(dataInput);
        return Array.isArray(parsed) ? parsed : null;
      } catch (e) {
        return null;
      }
    })();
    
    $: dataTableKeys =
      dataTableParsed && dataTableParsed.length > 0
        ? Object.keys(dataTableParsed[0])
        : [];
  
    // Reactive: parse the output string back to JSON for table view.
    $: parsedOutput = (() => {
      try {
        return JSON.parse(output);
      } catch (e) {
        return null;
      }
    })();
    
    $: outputTableParsed = Array.isArray(parsedOutput) ? parsedOutput : null;
    $: outputTableKeys =
      outputTableParsed && outputTableParsed.length > 0
        ? Object.keys(outputTableParsed[0])
        : [];
  </script>
  
  <!-- Layout: Three panels side-by-side (stacked on smaller screens) -->
  <div class="flex flex-col md:flex-row gap-4">
    <!-- Input Section -->
    <div class="flex-1">
      <div class="card shadow-lg">
        <div class="card-body">
          <h2 class="card-title">Input</h2>
          <!-- Toggle for JSON vs. Table view -->
          <div class="btn-group mb-2">
            <button
              class="btn {inputView === 'json' ? 'btn-active' : ''}"
              on:click={() => (inputView = 'json')}
            >
              JSON
            </button>
            <button
              class="btn {inputView === 'table' ? 'btn-active' : ''}"
              on:click={() => (inputView = 'table')}
            >
              Table
            </button>
          </div>
  
          {#if inputView === 'json'}
            <textarea
              bind:value={dataInput}
              class="textarea textarea-bordered w-full h-40"
            ></textarea>
          {:else}
            <div class="overflow-x-auto">
              {#if dataTableParsed}
                <table class="table w-full">
                  <thead>
                    <tr>
                      {#each dataTableKeys as key}
                        <th>{key}</th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody>
                    {#each dataTableParsed as row}
                      <tr>
                        {#each dataTableKeys as key}
                          <td>{row[key]}</td>
                        {/each}
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <p class="text-error">Invalid JSON</p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  
    <!-- Code Section -->
    <div class="flex-1">
      <div class="card shadow-lg">
        <div class="card-body">
          <h2 class="card-title">Code</h2>
          <textarea
            bind:value={codeInput}
            class="textarea textarea-bordered w-full h-40"
          ></textarea>
          <button class="btn btn-primary mt-2" on:click={runCode}>Run</button>
          {#if error}
            <p class="text-error mt-2">{error}</p>
          {/if}
        </div>
      </div>
    </div>
  
    <!-- Output Section -->
    <div class="flex-1">
      <div class="card shadow-lg">
        <div class="card-body">
          <h2 class="card-title">Output</h2>
          <!-- Toggle for JSON vs. Table view -->
          <div class="btn-group mb-2">
            <button
              class="btn {outputView === 'json' ? 'btn-active' : ''}"
              on:click={() => (outputView = 'json')}
            >
              JSON
            </button>
            <button
              class="btn {outputView === 'table' ? 'btn-active' : ''}"
              on:click={() => (outputView = 'table')}
            >
              Table
            </button>
          </div>
  
          {#if outputView === 'json'}
            <pre class="whitespace-pre-wrap">{output}</pre>
          {:else}
            <div class="overflow-x-auto">
              {#if outputTableParsed}
                <table class="table w-full">
                  <thead>
                    <tr>
                      {#each outputTableKeys as key}
                        <th>{key}</th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody>
                    {#each outputTableParsed as row}
                      <tr>
                        {#each outputTableKeys as key}
                          <td>{row[key]}</td>
                        {/each}
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <p class="text-error">Output is not an array of objects.</p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
  
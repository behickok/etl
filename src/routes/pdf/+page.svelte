<script>
  import { onMount } from 'svelte';
  import { createWorker, PSM } from 'tesseract.js';
  import { GoogleGenerativeAI } from "@google/generative-ai";
  import { PUBLIC_GEMINI_KEY } from '$env/static/public';

  let pdfjsLib;
  let pages = [];

  // Helper: Extract table data from Gemini response.
  function getTableData(page) {
    if (page.ocrTable && typeof page.ocrTable === 'object' && !Array.isArray(page.ocrTable)) {
      const keys = Object.keys(page.ocrTable);
      if (keys.length === 1) {
        return page.ocrTable[keys[0]];
      }
    }
    return page.ocrTable;
  }

  // Helper: Convert table data (array of objects) to CSV string.
  function tableToCSV(tableData) {
    if (!tableData || !tableData.length) return "";
    // Get headers from keys of first row.
    const headers = Object.keys(tableData[0]);
    const rows = tableData.map(row => headers.map(header => row[header]));
    // Join header and rows.
    const csvLines = [];
    csvLines.push(headers.join(","));
    rows.forEach(r => csvLines.push(r.join(",")));
    return csvLines.join("\n");
  }

  // Reactive block to redraw drawn bounding boxes.
  $: {
    pages.forEach((page) => {
      if (page.canvasElement) {
        const ctx = page.canvasElement.getContext('2d');
        ctx.clearRect(0, 0, page.canvasElement.width, page.canvasElement.height);
        let x, y, w, h;
        if (page.isDrawing) {
          x = Math.min(page.startX, page.currentX);
          y = Math.min(page.startY, page.currentY);
          w = Math.abs(page.currentX - page.startX);
          h = Math.abs(page.currentY - page.startY);
        } else if (page.boundingBox) {
          x = page.boundingBox.x;
          y = page.boundingBox.y;
          w = page.boundingBox.width;
          h = page.boundingBox.height;
        }
        if (x !== undefined) {
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
        }
      }
    });
  }

  // Import PDF.js and set worker path.
  onMount(async () => {
    const mod = await import('pdfjs-dist/build/pdf');
    pdfjsLib = mod;
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.mjs';
  });

  // Handle PDF upload and render pages.
  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;
  
    const fileReader = new FileReader();
    fileReader.onload = async function () {
      const typedarray = new Uint8Array(this.result);
      try {
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        pages = [];
        const scale = 2.0;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          await page.render({ canvasContext: context, viewport }).promise;
          const imageURL = canvas.toDataURL();
  
          pages = [
            ...pages,
            {
              imageURL,
              ocrTable: null,
              ocrText: null,
              ocrData: null,
              ocrInProgress: false,
              geminiInProgress: false,
              boundingBox: null,
              isDrawing: false,
              startX: 0,
              startY: 0,
              currentX: 0,
              currentY: 0,
              width: viewport.width,
              height: viewport.height,
              displayScale: 1,
              canvasElement: null,
              // Schema: default table name and empty columns.
              schema: {
                tableName: `table_${i}`,
                columns: []
              },
              // New property for view mode: "table" (default) or "csv"
              viewMode: "table"
            }
          ];
        }
      } catch (error) {
        console.error("Error processing PDF:", error);
      }
    };
    fileReader.readAsArrayBuffer(file);
  }
  
  // Canvas overlay mouse event handlers.
  function canvasMouseDown(index, event) {
    const rect = event.target.getBoundingClientRect();
    pages[index].isDrawing = true;
    pages[index].startX = event.clientX - rect.left;
    pages[index].startY = event.clientY - rect.top;
    pages[index].currentX = pages[index].startX;
    pages[index].currentY = pages[index].startY;
    updatePage(index);
  }
  
  function canvasMouseMove(index, event) {
    if (!pages[index].isDrawing) return;
    const rect = event.target.getBoundingClientRect();
    pages[index].currentX = event.clientX - rect.left;
    pages[index].currentY = event.clientY - rect.top;
    updatePage(index);
  }
  
  function canvasMouseUp(index, event) {
    if (!pages[index].isDrawing) return;
    pages[index].isDrawing = false;
    let x = Math.min(pages[index].startX, pages[index].currentX);
    let y = Math.min(pages[index].startY, pages[index].currentY);
    let width = Math.abs(pages[index].currentX - pages[index].startX);
    let height = Math.abs(pages[index].currentY - pages[index].startY);
    pages[index].boundingBox = { x, y, width, height };
    updatePage(index);
  }
  
  function updatePage(index) {
    pages = pages.map((p, i) => (i === index ? { ...p } : p));
  }
  
  // Schema form functions.
  function addColumn(index) {
    pages[index].schema.columns = [...pages[index].schema.columns, { name: "", type: "VARCHAR" }];
    updatePage(index);
  }
  
  function updateColumn(index, colIndex, field, value) {
    pages[index].schema.columns[colIndex][field] = value;
    updatePage(index);
  }
  
  // Toggle view mode for a page.
  function toggleViewMode(index) {
    pages[index].viewMode = pages[index].viewMode === "table" ? "csv" : "table";
    updatePage(index);
  }
  
  // Combined OCR & Gemini function.
  async function runOCR(index) {
    pages[index].ocrInProgress = true;
    updatePage(index);
    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_pageseg_mode: 3
    });
  
    let imageToProcess = pages[index].imageURL;
    if (pages[index].boundingBox) {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = pages[index].imageURL;
      });
      const offCanvas = document.createElement('canvas');
      offCanvas.width = pages[index].width;
      offCanvas.height = pages[index].height;
      const offCtx = offCanvas.getContext('2d');
      offCtx.drawImage(img, 0, 0);
  
      const scaleFactor = pages[index].displayScale;
      const bb = pages[index].boundingBox;
      const cropX = bb.x * scaleFactor;
      const cropY = bb.y * scaleFactor;
      const cropWidth = bb.width * scaleFactor;
      const cropHeight = bb.height * scaleFactor;
  
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropWidth;
      cropCanvas.height = cropHeight;
      const cropCtx = cropCanvas.getContext('2d');
      cropCtx.drawImage(offCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      imageToProcess = cropCanvas.toDataURL();
    }
  
    // Run OCR.
    const { data } = await worker.recognize(imageToProcess, { tessjs_create_tsv: '1' });
    pages[index].ocrData = data;
    const ocrText = data.text;
    pages[index].ocrText = ocrText;
    pages[index].ocrInProgress = false;
    await worker.terminate();
    updatePage(index);
  
    // Build Gemini prompt (append schema info if provided).
    let prompt = ocrText;
    const schema = pages[index].schema;
    if (schema) {
      if (schema.columns && schema.columns.length > 0) {
        const colsText = schema.columns
          .filter(col => col.name.trim() !== "")
          .map(col => `${col.name.trim()}(${col.type})`)
          .join(", ");
        if (colsText) {
          prompt += `\nThe columns I want are ${colsText}. The Data should be stored under the key: ${schema.tableName}.`;
        } else {
          prompt += `\nThe table name is ${schema.tableName}.`;
        }
      } else if (schema.tableName.trim() !== "") {
        prompt += `\nThe table name is ${schema.tableName}.`;
      }
    }
  
    // Push prompt to Gemini.
    pages[index].geminiInProgress = true;
    updatePage(index);
    try {
      const apiKey = PUBLIC_GEMINI_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        systemInstruction:
          "Please turn the following text which was extracted from a table using OCR back into a table structure. Please return the updated response as a JSON object with no further commentary.",
      });
  
      const generationConfig = {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: "text/plain",
      };
  
      const chatSession = model.startChat({
        generationConfig,
        history: [],
      });
  
      const result = await chatSession.sendMessage(prompt);
      console.log("Gemini API result:", result);
  
      const resultText = await result.response.text();
      console.log("Gemini API response text:", resultText);
  
      const cleaned = resultText
        .replace(/^```(?:json)?\n/, "")
        .replace(/```$/, "")
        .trim();
      console.log("Cleaned Gemini API text:", cleaned);
  
      const tableData = JSON.parse(cleaned);
      pages[index].ocrTable = tableData.table || tableData;
      pages[index].ocrText = null;
    } catch (error) {
      console.error("Gemini API error:", error);
    }
  
    pages[index].geminiInProgress = false;
    updatePage(index);
  }
</script>

<!-- Upload Screen -->
<div class="flex justify-center mt-8">
  <div class="card shadow-lg bg-base-200 p-6 max-w-md w-full">
    <h2 class="card-title text-center mb-4">Upload a PDF</h2>
    <input type="file" accept="application/pdf" class="file-input file-input-bordered w-full" on:change="{handleFileChange}" />
  </div>
</div>

<!-- PDF Pages -->
{#if pages.length > 0}
  <div class="container mx-auto mt-8 space-y-6">
    <h2 class="text-2xl font-bold mb-4">PDF Pages</h2>
    {#each pages as page, index}
      <div class="card bg-base-100 shadow p-4 flex flex-col md:flex-row gap-4">
        <!-- Left Column: Image and OCR Action -->
        <div class="md:w-1/2">
          <h3 class="text-xl font-semibold mb-2">Page {index + 1}</h3>
          <div class="relative max-w-full md:max-w-lg">
            <img src="{page.imageURL}" alt="PDF Page {index + 1}" 
              class="w-full object-contain" 
              on:load="{(e) => { page.displayScale = page.width / e.target.clientWidth; updatePage(index); }}" />
            <canvas 
              class="overlay absolute top-0 left-0 w-full h-full pointer-events-auto"
              width="{page.width / page.displayScale}"
              height="{page.height / page.displayScale}"
              bind:this="{page.canvasElement}"
              on:mousedown="{(e) => canvasMouseDown(index, e)}"
              on:mousemove="{(e) => canvasMouseMove(index, e)}"
              on:mouseup="{(e) => canvasMouseUp(index, e)}"
            ></canvas>
          </div>
          <button class="btn btn-primary mt-4 " on:click="{() => runOCR(index)}" disabled="{page.ocrInProgress || page.geminiInProgress}">
            {page.ocrInProgress || page.geminiInProgress ? "Processing..." : "Run OCR & Convert"}
          </button>
        </div>
        <!-- Right Column: Schema Form, Editable Table, and CSV Toggle -->
        <div class="md:w-1/2 space-y-4">
          <div class="card bg-base-200 p-4">
            <h4 class="text-lg font-semibold mb-2">Schema for this Table</h4>
            <div class="form-control mb-4">
              <label class="label">
                <span class="label-text">Table Name</span>
              </label>
              <input type="text" class="input input-bordered" bind:value="{page.schema.tableName}" />
            </div>
            <div class="mb-4">
              <h5 class="font-semibold mb-2">Columns</h5>
              {#each page.schema.columns as col, colIndex}
                <div class="flex gap-2 mb-2">
                  <input type="text" placeholder="Column Name" class="input input-bordered flex-1" bind:value="{col.name}" on:input="{(e) => updateColumn(index, colIndex, 'name', e.target.value)}" />
                  <select class="select select-bordered" bind:value="{col.type}" on:change="{(e) => updateColumn(index, colIndex, 'type', e.target.value)}">
                    <option value="VARCHAR">VARCHAR</option>
                    <option value="FLOAT">FLOAT</option>
                    <option value="INT">INT</option>
                  </select>
                </div>
              {/each}
              <button class="btn btn-sm btn-outline" type="button" on:click="{() => addColumn(index)}">Add Column</button>
              <button class="btn btn-ghost btn-sm" on:click="{() => toggleViewMode(index)}">
                {#if page.viewMode=="table"}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-table" viewBox="0 0 16 16">
                  <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm15 2h-4v3h4zm0 4h-4v3h4zm0 4h-4v3h3a1 1 0 0 0 1-1zm-5 3v-3H6v3zm-5 0v-3H1v2a1 1 0 0 0 1 1zm-4-4h4V8H1zm0-4h4V4H1zm5-3v3h4V4zm4 4H6v3h4z"/>
                </svg>
                {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-card-text" viewBox="0 0 16 16">
                  <path d="M14.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5zm-13-1A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2z"/>
                  <path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5M3 8a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 8m0 2.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5"/>
                </svg>
                {/if}
              </button>
            </div>
            <!-- Toggle for view mode -->
             
          </div>
          <div class="card bg-base-200 p-4 max-h-80 overflow-y-auto">
            <h4 class="text-lg font-semibold mb-2">Extracted Table Data / OCR Text</h4>
            {#if page.viewMode === "table"}
              {#if getTableData(page) && Array.isArray(getTableData(page)) && getTableData(page).length > 0}
                <table class="table w-full">
                  <thead>
                    <tr>
                      {#each Object.keys(getTableData(page)[0]) as headerCell}
                        <th>{headerCell}</th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody>
                    {#each getTableData(page) as row, rowIndex}
                      <tr>
                        {#each Object.keys(getTableData(page)[0]) as key}
                          <td>
                            <input type="text" class="input input-sm input-bordered w-full" bind:value={row[key]} on:change={() => updatePage(index)} />
                          </td>
                        {/each}
                      </tr>
                    {/each}
                  </tbody>
                </table>
          
              {:else}
                <p class="text-sm">No data extracted yet.</p>
              {/if}
            {:else}
              <!-- CSV view -->
              {#if getTableData(page) && Array.isArray(getTableData(page)) && getTableData(page).length > 0}
                <textarea class="textarea textarea-bordered w-full h-40" readonly>{tableToCSV(getTableData(page))}</textarea>
              {/if}
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}

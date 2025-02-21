<script>
    import { onMount } from 'svelte';
    import { createWorker, PSM } from 'tesseract.js';
    
    let pdfjsLib;
    let pages = [];
    
    // Import PDF.js and set worker path (using the .mjs file in /js/)
    onMount(async () => {
      const mod = await import('pdfjs-dist/build/pdf');
      pdfjsLib = mod;
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.mjs';
    });
    
    // Handle PDF upload and render pages at higher resolution.
    async function handleFileChange(event) {
      const file = event.target.files[0];
      if (!file) return;
    
      const fileReader = new FileReader();
      fileReader.onload = async function () {
        const typedarray = new Uint8Array(this.result);
        try {
          const pdf = await pdfjsLib.getDocument(typedarray).promise;
          pages = [];
          // Increase scale for better resolution.
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
                ocrTable: null,  // Parsed table data (array of rows) will go here.
                ocrText: null,   // Raw OCR text (if no table is determined).
                ocrData: null,   // Full OCR metadata (for debugging if needed).
                ocrInProgress: false,
                boundingBox: null, // { x, y, width, height } if drawn.
                // Drawing state for interactive bounding box:
                isDrawing: false,
                startX: 0,
                startY: 0,
                currentX: 0,
                currentY: 0,
                // Original dimensions for OCR (from the rendered canvas)
                width: viewport.width,
                height: viewport.height,
                // Computed on image load: ratio of original width to displayed width.
                displayScale: 1,
                canvasElement: null, // Bound to the overlay canvas.
              }
            ];
          }
        } catch (error) {
          console.error("Error processing PDF:", error);
        }
      };
      fileReader.readAsArrayBuffer(file);
    }
    
    // --- Canvas overlay mouse event handlers for drawing bounding boxes ---
    
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
      // Calculate the drawn bounding box (in display coordinates)
      let x = Math.min(pages[index].startX, pages[index].currentX);
      let y = Math.min(pages[index].startY, pages[index].currentY);
      let width = Math.abs(pages[index].currentX - pages[index].startX);
      let height = Math.abs(pages[index].currentY - pages[index].startY);
      pages[index].boundingBox = { x, y, width, height };
      updatePage(index);
    }
    
    function updatePage(index) {
      // Force Svelte reactivity.
      pages = pages.map((p, i) => (i === index ? { ...p } : p));
    }
    
    // --- Custom Table Parser from OCR Text ---
    // This function splits the OCR text on double newlines,
    // then tries all possible factorizations (row x col) and scores each candidate
    // based on column data type consistency.
    
    function parseTableFromText(text) {
      if (!text || !text.trim()) return null;
      // Split on double newline.
      let cells = text.split(/\n/).map(s => s.trim()).filter(s => s.length > 0);
      const n = cells.length;
      if (n === 0) return null;
    
      // Compute possible factorizations (r * c = n)
      let candidates = [];
      for (let r = 1; r <= n; r++) {
        if (n % r === 0) {
          let c = n / r;
          candidates.push({ rows: r, cols: c });
        }
      }
    
      // Simple type detection: number if parseFloat works; else text.
      function detectType(s) {
        return isNaN(parseFloat(s)) ? "text" : "number";
      }
    
      // Score candidate based on consistency in each column.
      function scoreCandidate(rows, cols) {
        let table = [];
        for (let i = 0; i < rows; i++) {
          let row = [];
          for (let j = 0; j < cols; j++) {
            row.push(cells[i * cols + j]);
          }
          table.push(row);
        }
        let score = 0;
        for (let j = 0; j < cols; j++) {
          let types = table.map(row => detectType(row[j]));
          let freq = {};
          types.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
          let maxFreq = Math.max(...Object.values(freq));
          score += maxFreq / rows; // fraction of column with the same type.
        }
        return score / cols; // average consistency across columns.
      }
    
      let bestCandidate = null;
      let bestScore = -Infinity;
      for (const cand of candidates) {
        let s = scoreCandidate(cand.rows, cand.cols);
        if (s > bestScore) {
          bestScore = s;
          bestCandidate = cand;
        }
      }
    
      if (!bestCandidate) return null;
    
      let table = [];
      for (let i = 0; i < bestCandidate.rows; i++) {
        let row = [];
        for (let j = 0; j < bestCandidate.cols; j++) {
          row.push(cells[i * bestCandidate.cols + j]);
        }
        table.push(row);
      }
    
      return table;
    }
    
    // --- OCR and Table Extraction ---
    async function runOCR(index) {
      pages[index].ocrInProgress = true;
      updatePage(index);
      const worker = await createWorker('eng');

      // Use a more flexible PSM (if needed) so Tesseract breaks up text.
      await worker.setParameters({
        tessedit_pageseg_mode: 3  // PSM.AUTO; try other modes if necessary.
      });
    
      // Determine which image to process.
      // If a bounding box exists, crop the image using scaled coordinates.
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
    
      // Run OCR and get the full data.
      const { data } = await worker.recognize(imageToProcess, {
        tessjs_create_tsv: '1'
      });
    console.log(data)
      // Store the complete OCR data (for debugging).
      pages[index].ocrData = data;
    
      // Now attempt to parse a table from the OCR text.
      let parsedTable = parseTableFromText(data.text);
      // If the parsed table has more than one column, use it.
      if (parsedTable && parsedTable.length > 0 && parsedTable[0].length > 1) {
        pages[index].ocrTable = parsedTable;
        pages[index].ocrText = null;
      } else {
        // Otherwise, keep the raw text.
        pages[index].ocrText = data.text;
        pages[index].ocrTable = null;
      }
    
      pages[index].ocrInProgress = false;
      await worker.terminate();
      updatePage(index);
    }

    $: {
      pages.forEach((page, index) => {
        if (page.canvasElement) {
          const canvas = page.canvasElement;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  </script>
    
  <div>
    <h2>Upload a PDF</h2>
    <input type="file" accept="application/pdf" on:change="{handleFileChange}" />
  </div>
    
  {#if pages.length > 0}
    <h2>PDF Pages</h2>
    {#each pages as page, index}
      <div class="page">
        <!-- Left Column: Image with interactive canvas overlay -->
        <div class="left-column">
          <h3>Page {index + 1}</h3>
          <div class="image-container" style="position: relative; width: 100%; max-width: 600px;">
            <img
              src="{page.imageURL}"
              alt="PDF Page {index + 1}"
              on:load="{(e) => {
                page.displayScale = page.width / e.target.clientWidth;
                updatePage(index);
              }}"
              style="display: block; width: 100%;"
            />
            <canvas
              class="overlay"
              width="{page.width / page.displayScale}"
              height="{page.height / page.displayScale}"
              bind:this="{page.canvasElement}"
              on:mousedown="{(e) => canvasMouseDown(index, e)}"
              on:mousemove="{(e) => canvasMouseMove(index, e)}"
              on:mouseup="{(e) => canvasMouseUp(index, e)}"
              style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: auto;"
            ></canvas>
          </div>
          <button on:click="{() => runOCR(index)}" disabled="{page.ocrInProgress}">
            {page.ocrInProgress ? "Processing OCR..." : "Run OCR"}
          </button>
        </div>
    
        <!-- Right Column: Display extracted table or raw text -->
        <div class="right-column">
          <h4>Extracted Table Data / OCR Text</h4>
          {#if page.ocrTable}
            <table border="1">
              <thead>
                <tr>
                  {#each page.ocrTable[0] as headerCell}
                    <th>{headerCell}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each page.ocrTable.slice(1) as row}
                  <tr>
                    {#each row as cell}
                      <td>{cell}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else if page.ocrText}
            <p>Extracted OCR Text:</p>
            <pre>{page.ocrText}</pre>
          {:else}
            <p>No data extracted yet.</p>
          {/if}
        </div>
      </div>
    {/each}
  {/if}
    
  <style>
    .page {
      display: flex;
      border: 1px solid #ccc;
      padding: 1rem;
      margin-bottom: 2rem;
      gap: 1rem;
    }
    .left-column,
    .right-column {
      flex: 1;
    }
    .image-container {
      position: relative;
      margin-bottom: 1rem;
    }
    .overlay {
      background: transparent;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 4px;
      text-align: left;
    }
  </style>
    

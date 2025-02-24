// src/routes/api/upload.js
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import { PUBLIC_GEMINI_KEY } from '$env/static/public';
const genAI = new GoogleGenerativeAI(PUBLIC_GEMINI_KEY);
const fileManager = new GoogleAIFileManager(PUBLIC_GEMINI_KEY);

/**
 * Uploads a file (from a POST FormData upload) to Gemini,
 * waits for it to be processed, and returns its details.
 */
export async function POST({ request }) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
    }

    // Read file data from the browser upload.
    const buffer = Buffer.from(await file.arrayBuffer());
    // Create a temporary file path.
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, file.name);
    await fs.writeFile(tempFilePath, buffer);

    // Upload the file to Gemini.
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType: file.type,
      displayName: file.name,
    });
    const uploadedFile = uploadResult.file;
    // console.log(`Uploaded file ${uploadedFile.displayName} as: ${uploadedFile.name}`);

    // Poll until the file is active.
    let fileStatus = await fileManager.getFile(uploadedFile.name);
    while (fileStatus.state === "PROCESSING") {
      await new Promise(resolve => setTimeout(resolve, 10_000));
      fileStatus = await fileManager.getFile(uploadedFile.name);
    }
    if (fileStatus.state !== "ACTIVE") {
      return new Response(JSON.stringify({ error: `File ${uploadedFile.name} failed to process` }), { status: 500 });
    }

    // Optionally, clean up the temporary file.
    await fs.unlink(tempFilePath);

    return new Response(JSON.stringify(fileStatus), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

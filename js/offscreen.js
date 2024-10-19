// Import FFmpeg from the WASM library
const { FFmpeg } = FFmpegWASM;
const { fetchFile } = FFmpegUtil;

console.log("offscreen.js loaded successfully");

const ffmpeg = new FFmpeg();

const coreUrl = chrome.runtime.getURL("lib/ffmpeg/ffmpeg-core.js");
const wasmUrl = chrome.runtime.getURL("lib/ffmpeg/ffmpeg-core.wasm");

// log ffmpeg messages
ffmpeg.on("log", ({ message }) => {
    console.log(message);
});

// progress bar
ffmpeg.on("progress", ({ progress, time }) => {
    console.log((progress * 100) + "%, time: " + (time / 1000000) + " s");
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.target === "offscreen" && message.action === "convertTsToMp4") {
    console.log({message})
    convertTsToMp4(message.fileName, message.fileData);
  }
});

async function convertTsToMp4(fileName, fileData) {
    const inputFileName = fileName;
    const outputFileName = inputFileName.replace('.ts', '.mp4');

    // exit ffmpeg if it is already loaded
    if (ffmpeg.loaded) {
        await ffmpeg.terminate();
    }

    // load ffmpeg
    await ffmpeg.load({
        coreURL: coreUrl,
        wasmURL: wasmUrl,
    });

    // write file to filesystem
    ffmpeg.writeFile(inputFileName, new Uint8Array(fileData));

    // execute command
    const commandList = ['-i', inputFileName, '-c', 'copy', outputFileName];
    console.log("Executing command:", commandList);
    await ffmpeg.exec(commandList);

    // read output file
    const data = await ffmpeg.readFile(outputFileName);

    // create blob and download
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    console.log(blob);
    downloadFile(blob, outputFileName);
    /* chrome.runtime.sendMessage({
        action: "conversionComplete",
        fileName: outputFileName,
        data: blob
      }); */
}
function downloadFile(blob, fileName) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
}
/* async function convertTsToMp4(file) {
  try {
    console.log("Starting conversion process");
    console.log("FFmpeg instance created");
    
    await ffmpeg.load();
    console.log("FFmpeg loaded successfully");

    const inputFileName = file.name;
    const outputFileName = inputFileName.replace('.ts', '.mp4');

    console.log(`Writing input file: ${inputFileName}`);
    ffmpeg.FS('writeFile', inputFileName, await fetchFile(file));
    
    console.log("Starting FFmpeg conversion");
    await ffmpeg.run('-i', inputFileName, '-c', 'copy', outputFileName);
    console.log("FFmpeg conversion completed");

    const data = ffmpeg.FS('readFile', outputFileName);
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    console.log("Sending converted file back to background script");
    chrome.runtime.sendMessage({
      action: "conversionComplete",
      fileName: outputFileName,
      data: blob
    });

  } catch (error) {
    console.error("Conversion error:", error);
    chrome.runtime.sendMessage({
      action: "conversionError",
      error: error.message
    });
  }
} */
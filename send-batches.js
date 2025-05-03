const fs = require("fs");
const path = require("path");
const https = require("https");
const url = require("url");

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const EMAILS_PATH = process.env.EMAILS_PATH;
const TOKEN = process.env.TOKEN;
const START = fs.existsSync("next.txt")
  ? parseInt(fs.readFileSync("next.txt", "utf8"))
  : process.env.START
  ? parseInt(process.env.START)
  : 0;
const RETRY_MODE = process.env.RETRY_MODE === "true" || process.env.RETRY_MODE === "1";
const RETRIES = fs.existsSync("failed.txt")
  ? fs
      .readFileSync("failed.txt", "utf8")
      .split("\n")
      .map(Number)
      .filter((n) => !isNaN(n))
  : [];
if (!WEBHOOK_URL) throw new Error("WEBHOOK_URL should be defined");
if (!EMAILS_PATH) throw new Error("EMAILS_PATH should be defined");
if (!TOKEN) throw new Error("TOKEN should be defined");

// Configuration
const config = {
  inputFile: path.join(__dirname, EMAILS_PATH),
  webhookUrl: WEBHOOK_URL,
  token: TOKEN,
  batchSize: parseInt(process.env.BATCH_SIZE ?? 10),
  delayBetweenBatchesMs: parseInt(1000 * (process.env.DELAY_BETWEEN_BATCHES_MS ?? 30)),
  start: START,
  retryMode: RETRY_MODE,
  retries: RETRIES,
};
const { token, webhookUrl, ...rest } = config;
console.log({ rest });

// Function to send a batch to the webhook
function sendBatch(batch, batchNumber, totalBatches) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(config.webhookUrl);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${config.token}`,
        "Content-Length": Buffer.byteLength(JSON.stringify(batch)),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Batch ${batchNumber}/${totalBatches} sent successfully (Status: ${res.statusCode})`);
          resolve();
        } else {
          console.error(`❌ Batch ${batchNumber}/${totalBatches} failed with status: ${res.statusCode}`);
          console.error(`Response: ${responseData}`);
          reject(new Error(`HTTP error! status: ${res.statusCode}`));
        }
      });
    });

    req.on("error", (error) => {
      console.error(`❌ Error sending batch ${batchNumber}/${totalBatches}:`, error.message);
      reject(error);
    });

    req.write(JSON.stringify(batch));
    req.end();
  });
}

// Main function
async function main() {
  try {
    console.log("Starting batch processing...");
    console.log(`Reading from: ${config.inputFile}`);

    // Check if file exists
    if (!fs.existsSync(config.inputFile)) {
      throw new Error(`Input file not found: ${config.inputFile}`);
    }

    // Read and parse the JSON file
    console.log("Reading JSON file...");
    const rawData = fs.readFileSync(config.inputFile, "utf8");

    let data;

    try {
      data = JSON.parse(rawData);
    } catch (parseError) {
      throw new Error(`Failed to parse JSON: ${parseError.message}`);
    }

    // Ensure data is an array
    if (!Array.isArray(data)) {
      if (typeof data === "object") {
        // If it's an object with a property that's an array, try to use that
        const arrayProps = Object.keys(data).filter((key) => Array.isArray(data[key]));
        if (arrayProps.length === 1) {
          data = data[arrayProps[0]];
          console.log(`Using array from property: ${arrayProps[0]}`);
        } else {
          throw new Error("JSON data is not an array and no single array property could be identified");
        }
      } else {
        throw new Error("JSON data is not an array");
      }
    }

    const totalItems = data.length;
    console.log(`Total items: ${totalItems}`);

    // Split into batches
    const batches = [];
    for (let i = 0; i < totalItems; i += config.batchSize) {
      batches.push(data.slice(i, i + config.batchSize));
    }

    const totalBatches = batches.length;
    console.log(`Split into ${totalBatches} batches of up to ${config.batchSize} items each`);

    // Process batches
    for (let i = config.start; i < batches.length; i++) {
      if (config.retries.length && !config.retries.includes(i) && config.retryMode) {
        console.log(`Skipping batch ${i + 1} because only doing retries`);
        continue;
      }

      const batchNumber = i + 1;
      console.log(`Processing batch ${batchNumber}/${totalBatches}...`);

      try {
        await sendBatch(batches[i], batchNumber, totalBatches);
      } catch (error) {
        console.error(`Failed processing batch ${batchNumber}:`, error.message);
        // make sure the file is created
        if (!fs.existsSync("failed.txt")) {
          fs.writeFileSync("failed.txt", "");
        }
        // append failed index to the file
        fs.appendFileSync("failed.txt", `${i}\n`);
      }

      // Delay before next batch (except after the last batch)
      if (i < batches.length - 1) {
        console.log(`Waiting ${config.delayBetweenBatchesMs}ms before next batch...`);
        await new Promise((resolve) => setTimeout(resolve, config.delayBetweenBatchesMs));
      }
    }

    console.log("✅ All batches processed!");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

// Run the main function
main();

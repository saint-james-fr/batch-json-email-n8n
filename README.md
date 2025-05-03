# Batch JSON to Webhook Sender

This Node.js script reads a JSON file containing an array of items, splits them into batches, and sends each batch sequentially to a specified webhook URL via POST requests. It includes features for rate limiting (delay between batches), handling failures, retrying failed batches, and resuming processing from where it left off.

## Prerequisites

- **Node.js:** Ensure you have Node.js installed (version 14 or later recommended).
- **Input JSON File:** A JSON file containing the data to be sent. The script expects the top-level structure to be an array of items, or an object containing exactly one property whose value is an array of items.

## Setup

2.  **Prepare your data:** Import your JSON data file (e.g., `emails.json`).
3.  **Configure Environment Variables:** The script relies on environment variables for configuration. You can create a `.env` file and load it with node (it does need node version superior or equals to v20.6.0) or just set them up in your shell before running the script.

```bash

node --env-file=.env send-batches.js

# or 

export WEBHOOK_URL="..."
export EMAILS_PATH="..."
export TOKEN="..."
export BATCH_SIZE=50
export DELAY_BETWEEN_BATCHES_MS=60 # 60 seconds delay
export START=5 # 0-based index of the batch to start processing from
export RETRY_MODE=true # only process batches whose indices are listed in the `failed.txt` file
node send-batches.js

# or

WEBHOOK_URL="..." EMAILS_PATH="..." TOKEN="..." BATCH_SIZE=50 DELAY_BETWEEN_BATCHES_MS=60 START=5 RETRY_MODE=true node send-batches.js

```

## Configuration

The following environment variables are used to configure the script. See `.env.example` for more details.

- `WEBHOOK_URL` (**Required**): The full URL of the webhook endpoint that will receive the POST requests.
- `EMAILS_PATH` (**Required**): The path to the input JSON file, relative to the script's directory (e.g., `data/emails.json`).
- `TOKEN` (**Required**): An authorization token (e.g., Bearer token, API key) that will be included in the `Authorization` header of each request.
- `BATCH_SIZE` (Optional): The maximum number of items to include in each batch. Defaults to `10`.
- `DELAY_BETWEEN_BATCHES_MS` (Optional): The delay in **seconds** between sending consecutive batches. Defaults to `30`.
- `START` (Optional): The **0-based index** of the batch to start processing from. If omitted, processing starts from batch 0. If a `next.txt` file exists (see below), its content overrides this environment variable. Defaults to `0`.
- `RETRY_MODE` (Optional): Set to `true` (or any non-empty value) to only process batches whose indices are listed in the `failed.txt` file. Defaults to `false`.

## Usage

Run the script using Node.js, ensuring the necessary environment variables are set:

```bash
# Example: Basic usage

node --env-file=.env send-batches.js

```

## State Files

The script uses two files in the same directory to manage its state:

- `failed.txt`: If a batch fails to send (e.g., due to a network error or non-2xx response from the webhook), the **0-based index** of that failed batch is appended to this file. This allows for targeted retries later.
- `next.txt`: The script checks for this file on startup. If it exists, it reads the number inside and uses it as the starting batch index, overriding the `START` environment variable. This is intended to allow resuming from the exact point of interruption, although the current script version doesn't automatically _write_ to this file after each successful batch. You have to do it manually running `echo "someNumber" > next.txt`.

## Retrying Failed Batches

1.  Run the script normally. If any batches fail, their indices will be recorded in `failed.txt`.
2.  To retry _only_ the failed batches, run the script again with `RETRY_MODE` set to true.

The script will then read `failed.txt` and only attempt to send the batches whose indices are listed in that file.

## Resuming Processing

If the script is stopped or crashes, you can potentially resume it:

1.  **Using `START`:** Manually set the `START` environment variable to the index of the batch you want to resume from.
2.  **Using `next.txt`:** If a `next.txt` file exists from a previous run (or if you manually create one containing the next batch index), the script will automatically start from that index.

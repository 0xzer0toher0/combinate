require("dotenv").config(); // Load variabel dari .env
const { ethers } = require("ethers");
const winston = require("winston"); // Logger
const chalk = require("chalk"); // Untuk warna di console
const prompts = require("prompts"); // Untuk prompt input pengguna

// Konfigurasi logger menggunakan winston
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

// Konfigurasi provider untuk Somnia Network
const provider = new ethers.JsonRpcProvider(
  "https://rpc.ankr.com/somnia_testnet/6e3fd81558cf77b928b06b38e9409b4677b637118114e83364486294d5ff4811"
); // RPC Somnia
const chainId = 50312; // Somnia chain ID

// Inisialisasi wallet dari private key di .env
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error("PRIVATE_KEY not found in .env file");
}
const wallet = new ethers.Wallet(privateKey, provider);

// Inisialisasi EXPLORER_URL_SOMNIA
const EXPLORER_URL_SOMNIA = "https://shannon-explorer.somnia.network/tx/0x";

// Daftar alamat developer untuk RandomTokenSender
const DEVS_RECIPIENTS = [
  "0xDA1feA7873338F34C6915A44028aA4D9aBA1346B",
  "0x018604C67a7423c03dE3057a49709aaD1D178B85",
  "0xcF8D30A5Ee0D9d5ad1D7087822bA5Bab1081FdB7",
  "0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5",
];

// Konfigurasi statis (menggabungkan konfigurasi dari kedua bot)
const config = {
  SOMNIA_NETWORK: {
    SOMNIA_TOKEN_SENDER: {
      NUMBER_OF_SENDS: { minTxs: 1, maxTxs: 3 },
      SEND_ALL_TO_DEVS_CHANCE: 20,
      AMOUNT_RANGE: { minAmount: 0.0001, maxAmount: 0.0009 },
    },
    SOMNIA_SWAPS: {
      NUMBER_OF_SWAPS: { minTxs: 1, maxTxs: 3 },
      BALANCE_PERCENT_TO_SWAP: { minPercent: 10, maxPercent: 35 },
    },
  },
  SETTINGS: {
    RANDOM_PAUSE_BETWEEN_ACTIONS: [2, 5],
    PAUSE_BETWEEN_ATTEMPTS: [5, 10],
    ATTEMPTS: 3,
    MINIMUM_BALANCE: 0.0001,
  },
};

// Indeks akun statis
const accountIndex = 1;

// Kelas RandomTokenSender (dari random.js)
class RandomTokenSender {
  constructor(wallet) {
    this.wallet = wallet;
    this.accountIndex = accountIndex;
    this.config = config;
  }

  async sendTokens() {
    try {
      console.log(chalk.bgMagenta.white.bold("-------------------[ STT TOKEN SENDER BOT ]-------------------"));
      let result = true;

      // Cek saldo wallet
      const balance = await provider.getBalance(this.wallet.address);
      if (balance === 0n) {
        logger.warning(chalk.yellow(`? ${this.accountIndex} | No balance to send tokens`));
        console.log(chalk.yellow(`[WARN] ? No STT balance to send ?`));
        return false;
      }

      logger.info(chalk.green(`? Balance checked: ${ethers.formatEther(balance)} STT`));
      console.log(
        chalk.cyan(`[BALANCE] ?? Saldo di ${this.wallet.address}: ${ethers.formatEther(balance)} STT ??`)
      );

      // Ambil jumlah transaksi dari konfigurasi
      const { minTxs, maxTxs } = this.config.SOMNIA_NETWORK.SOMNIA_TOKEN_SENDER.NUMBER_OF_SENDS;
      const numTransactions = Math.floor(Math.random() * (maxTxs - minTxs + 1)) + minTxs;

      logger.info(chalk.cyan(`?? ${this.accountIndex} | Planning to send ${numTransactions} transactions`));
      console.log(chalk.cyan(`[INFO] ?? Planning ${numTransactions} STT send transactions ??`));

      for (let i = 0; i < numTransactions; i++) {
        // Tentukan penerima berdasarkan peluang
        const devChance = this.config.SOMNIA_NETWORK.SOMNIA_TOKEN_SENDER.SEND_ALL_TO_DEVS_CHANCE;
        let recipient;

        if (Math.random() * 100 <= devChance) {
          recipient = DEVS_RECIPIENTS[Math.floor(Math.random() * DEVS_RECIPIENTS.length)];
          recipient = ethers.getAddress(recipient);
          logger.info(
            chalk.cyan(`?? ${this.accountIndex} | Transaction ${i + 1}/${numTransactions}: Sending to dev wallet ${recipient}`)
          );
          console.log(
            chalk.blue(`[SEND] ?? Transaction ${i + 1}/${numTransactions}: Sending to dev wallet ${recipient} ??`)
          );
        } else {
          const randomWallet = ethers.Wallet.createRandom();
          recipient = randomWallet.address;
          logger.info(
            chalk.cyan(`?? ${this.accountIndex} | Transaction ${i + 1}/${numTransactions}: Sending to random wallet ${recipient}`)
          );
          console.log(
            chalk.blue(`[SEND] ?? Transaction ${i + 1}/${numTransactions}: Sending to random wallet ${recipient} ??`)
          );
        }

        // Kirim transaksi dengan jumlah acak
        result = await this._send(recipient);

        // Jeda antar transaksi
        if (i < numTransactions - 1) {
          const pause =
            Math.random() *
              (this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[1] -
                this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[0]) +
            this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[0];
          logger.info(chalk.cyan(`? ${this.accountIndex} | Waiting ${pause.toFixed(1)} seconds before next transaction...`));
          console.log(chalk.cyan(`? Waiting for next transaction...`));
          await new Promise((resolve) => setTimeout(resolve, pause * 1000));
        }
      }

      console.log(chalk.bgMagenta.white.bold("-------------------[ SEND COMPLETED ]-------------------"));
      return result;
    } catch (e) {
      logger.error(chalk.red(`? ${this.accountIndex} | Send tokens error: ${e.message}`));
      console.log(chalk.red(`[ERROR] ? Send bot error: ${e.message} ?`));
      return false;
    }
  }

  async _send(recipient) {
    try {
      const balance = await provider.getBalance(this.wallet.address);
      const balanceEther = Number(ethers.formatEther(balance));
      const { minAmount, maxAmount } = this.config.SOMNIA_NETWORK.SOMNIA_TOKEN_SENDER.AMOUNT_RANGE;
      const minimumRequired = minAmount;

      if (balanceEther < minimumRequired) {
        throw new Error(`Insufficient balance (${balanceEther.toFixed(6)} STT < ${minimumRequired} STT)`);
      }

      const amountEther = Math.random() * (maxAmount - minAmount) + minAmount;
      const roundedAmount = Math.round(amountEther * 10000) / 10000;
      const amountToSend = ethers.parseEther(roundedAmount.toString()) * 95n / 100n;

      logger.info(chalk.cyan(`?? ${this.accountIndex} | Starting send ${roundedAmount.toFixed(4)} STT to ${recipient}`));
      console.log(chalk.blue(`[SEND] ?? Sending ${roundedAmount.toFixed(4)} STT to ${recipient} ??`));

      const txData = {
        to: recipient,
        value: amountToSend,
      };

      const gasLimit = await provider.estimateGas({
        ...txData,
        from: this.wallet.address,
      });
      txData.gasLimit = gasLimit;

      const tx = await this.wallet.sendTransaction(txData);

      logger.info(chalk.green(`? Transaction sent: ${tx.hash}`));
      console.log(chalk.green(`[TX] ? Transaction sent, TX Hash: ${tx.hash} ?`));

      const receipt = await tx.wait();

      logger.info(
        chalk.green(`? Successfully sent ${roundedAmount.toFixed(4)} STT to ${recipient}. TX: ${EXPLORER_URL_SOMNIA}${receipt.transactionHash}`)
      );
      console.log(chalk.green(`[TX] ? Transaction confirmed: ${EXPLORER_URL_SOMNIA}${receipt.transactionHash} ?`));
      return true;
    } catch (e) {
      const pause = Math.floor(
        Math.random() *
          (this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] -
            this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
        this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
      );
      logger.error(chalk.red(`? ${this.accountIndex} | Send tokens error: ${e.message}. Sleeping ${pause} seconds...`));
      console.log(chalk.red(`[ERROR] ? Send error: ${e.message} ?`));
      await new Promise((resolve) => setTimeout(resolve, pause * 1000));
      throw e;
    }
  }
}

// Kelas PingPongSwaps (dari ping.js)
class PingPongSwaps {
  constructor(wallet) {
    this.wallet = wallet;
    this.accountIndex = accountIndex;
    this.config = config;
  }

  async swaps() {
    try {
      console.log(chalk.bgMagenta.white.bold("-------------------[ PING PONG SWAP BOT ]-------------------"));
      const pingTokenAddress = ethers.getAddress("0x33e7fab0a8a5da1a923180989bd617c9c2d1c493");
      const pongTokenAddress = ethers.getAddress("0x9beaA0016c22B646Ac311Ab171270B0ECf23098F");
      const routerAddress = ethers.getAddress("0x6AAC14f090A35EeA150705f72D90E4CDC4a49b2C");

      const tokenAbi = [
        {
          name: "balanceOf",
          inputs: [{ name: "owner", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
        {
          name: "approve",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          name: "allowance",
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
        {
          name: "transfer",
          inputs: [
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          name: "transferFrom",
          inputs: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          name: "decimals",
          inputs: [],
          outputs: [{ name: "", type: "uint8" }],
          stateMutability: "view",
          type: "function",
        },
        {
          name: "mint",
          inputs: [],
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
      ];

      const routerAbi = [
        {
          name: "exactInputSingle",
          inputs: [
            {
              name: "params",
              type: "tuple",
              components: [
                { name: "tokenIn", type: "address" },
                { name: "tokenOut", type: "address" },
                { name: "fee", type: "uint24" },
                { name: "recipient", type: "address" },
                { name: "amountIn", type: "uint256" },
                { name: "amountOutMinimum", type: "uint256" },
                { name: "sqrtPriceLimitX96", type: "uint160" },
              ],
            },
          ],
          outputs: [{ name: "amountOut", type: "uint256" }],
          stateMutability: "nonpayable",
          type: "function",
        },
      ];

      const pingContract = new ethers.Contract(pingTokenAddress, tokenAbi, this.wallet);
      const pongContract = new ethers.Contract(pongTokenAddress, tokenAbi, this.wallet);

      let pingBalance = await pingContract.balanceOf(this.wallet.address);
      let pongBalance = await pongContract.balanceOf(this.wallet.address);

      logger.info(
        chalk.green(`? Balance checked: ${ethers.formatUnits(pingBalance, 18)} PING, ${ethers.formatUnits(pongBalance, 18)} PONG`)
      );
      console.log(
        chalk.cyan(
          `[BALANCE] ?? Saldo di ${this.wallet.address}: ${ethers.formatUnits(pingBalance, 18)} PING, ${ethers.formatUnits(
            pongBalance,
            18
          )} PONG ??`
        )
      );

      if (pingBalance === 0n && pongBalance === 0n) {
        logger.error(chalk.red(`? ${this.accountIndex} | No tokens to swap. Both PING and PONG balances are zero.`));
        console.log(chalk.red(`[ERROR] ? No tokens to swap. Both PING and PONG balances are zero. ?`));
        return false;
      }

      const { minTxs, maxTxs } = this.config.SOMNIA_NETWORK.SOMNIA_SWAPS.NUMBER_OF_SWAPS;
      const numSwaps = Math.floor(Math.random() * (maxTxs - minTxs + 1)) + minTxs;

      logger.info(chalk.cyan(`?? ${this.accountIndex} | Planning to execute ${numSwaps} swaps`));
      console.log(chalk.cyan(`[INFO] ?? Planning ${numSwaps} swaps ??`));

      let successCount = 0;

      for (let i = 0; i < numSwaps; i++) {
        if (i > 0) {
          pingBalance = await pingContract.balanceOf(this.wallet.address);
          pongBalance = await pongContract.balanceOf(this.wallet.address);

          logger.info(
            chalk.green(`? Balance updated: ${ethers.formatUnits(pingBalance, 18)} PING, ${ethers.formatUnits(pongBalance, 18)} PONG`)
          );
          console.log(
            chalk.cyan(
              `[BALANCE] ?? Saldo di ${this.wallet.address}: ${ethers.formatUnits(pingBalance, 18)} PING, ${ethers.formatUnits(
                pongBalance,
                18
              )} PONG ??`
            )
          );
        }

        if (pingBalance === 0n && pongBalance === 0n) {
          logger.warn(chalk.yellow(`? ${this.accountIndex} | No tokens left to swap. Ending swap sequence.`));
          console.log(chalk.yellow(`[WARN] ? No tokens left to swap. Ending swap sequence. ?`));
          break;
        }

        let tokenInAddress, tokenInName, tokenOutAddress, tokenOutName, tokenBalance;
        if (pingBalance > 0n && pongBalance > 0n) {
          if (Math.random() > 0.5) {
            tokenInAddress = pingTokenAddress;
            tokenInName = "PING";
            tokenOutAddress = pongTokenAddress;
            tokenOutName = "PONG";
            tokenBalance = pingBalance;
          } else {
            tokenInAddress = pongTokenAddress;
            tokenInName = "PONG";
            tokenOutAddress = pingTokenAddress;
            tokenOutName = "PING";
            tokenBalance = pongBalance;
          }
        } else if (pingBalance > 0n) {
          tokenInAddress = pingTokenAddress;
          tokenInName = "PING";
          tokenOutAddress = pongTokenAddress;
          tokenOutName = "PONG";
          tokenBalance = pingBalance;
        } else {
          tokenInAddress = pongTokenAddress;
          tokenInName = "PONG";
          tokenOutAddress = pingTokenAddress;
          tokenOutName = "PING";
          tokenBalance = pongBalance;
        }

        logger.info(chalk.cyan(`?? ${this.accountIndex} | Swap ${i + 1}/${numSwaps}: ${tokenInName} to ${tokenOutName}`));
        console.log(chalk.blue(`[SWAP] ?? Swap ${i + 1}/${numSwaps}: ${tokenInName} to ${tokenOutName} ??`));

        const minAmount = 100;
        const maxAmount = 100;
        const randomAmount = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
        const amountToSwap = ethers.parseUnits(randomAmount.toString(), 18);

        if (tokenBalance < amountToSwap) {
          logger.warn(
            chalk.yellow(
              `? ${this.accountIndex} | Insufficient ${tokenInName} balance (${ethers.formatUnits(
                tokenBalance,
                18
              )} < ${randomAmount}). Skipping swap.`
            )
          );
          console.log(
            chalk.yellow(`[WARN] ? Insufficient ${tokenInName} balance (${ethers.formatUnits(tokenBalance, 18)} < ${randomAmount}). Skipping swap. ?`)
          );
          continue;
        }

        logger.info(chalk.cyan(`?? ${this.accountIndex} | Swapping ${randomAmount} ${tokenInName} to ${tokenOutName}`));
        console.log(chalk.blue(`[SWAP] ?? Swapping ${randomAmount} ${tokenInName} to ${tokenOutName} ??`));

        const tokenContract = new ethers.Contract(tokenInAddress, tokenAbi, this.wallet);
        const currentAllowance = await tokenContract.allowance(this.wallet.address, routerAddress);

        if (currentAllowance < amountToSwap) {
          logger.info(chalk.cyan(`?? ${this.accountIndex} | Approving ${randomAmount} ${tokenInName} for router`));
          console.log(chalk.cyan(`[APPROVE] ?? Approving ${randomAmount} ${tokenInName} for router ??`));
          const approveTx = await tokenContract.approve(routerAddress, amountToSwap);
          await approveTx.wait();
          logger.info(chalk.green(`? ${this.accountIndex} | Successfully approved ${tokenInName}`));
          console.log(chalk.green(`[APPROVE] ? Approval for ${randomAmount} ${tokenInName} completed ?`));
        } else {
          logger.info(chalk.green(`? ${this.accountIndex} | No approval needed for ${tokenInName} (sufficient allowance)`));
          console.log(chalk.green(`[APPROVE] ? No approval needed for ${tokenInName} (already approved) ?`));
        }

        const swapParams = {
          tokenIn: tokenInAddress,
          tokenOut: tokenOutAddress,
          fee: 500,
          recipient: this.wallet.address,
          amountIn: amountToSwap,
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0,
        };

        const routerContract = new ethers.Contract(routerAddress, routerAbi, this.wallet);

        try {
          const swapTx = await routerContract.exactInputSingle(swapParams);
          logger.info(chalk.green(`? ${this.accountIndex} | Swap transaction sent: ${swapTx.hash}`));
          console.log(chalk.green(`[TX] ? Transaction sent, TX Hash: ${swapTx.hash} ?`));

          const receipt = await swapTx.wait();
          logger.info(
            chalk.green(
              `? ${this.accountIndex} | Successfully swapped ${randomAmount} ${tokenInName} to ${tokenOutName}. TX: ${EXPLORER_URL_SOMNIA}${receipt.transactionHash}`
            )
          );
          console.log(chalk.green(`[TX] ? Transaction confirmed: ${EXPLORER_URL_SOMNIA}${receipt.transactionHash} ?`));
          successCount++;
        } catch (e) {
          logger.error(chalk.red(`? ${this.accountIndex} | Failed to swap ${tokenInName} to ${tokenOutName}: ${e.message}`));
          console.log(chalk.red(`[SWAP] ? Swap failed: ${e.message} ?`));
          continue;
        }

        if (i < numSwaps - 1) {
          const pause =
            Math.random() *
              (this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[1] -
                this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[0]) +
            this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[0];
          logger.info(chalk.cyan(`? ${this.accountIndex} | Waiting ${pause.toFixed(1)} seconds before next swap...`));
          console.log(chalk.cyan(`? Waiting for next swap...`));
          await new Promise((resolve) => setTimeout(resolve, pause * 1000));
        }
      }

      console.log(chalk.bgMagenta.white.bold("-------------------[ SWAP COMPLETED ]-------------------"));
      return successCount > 0;
    } catch (e) {
      const pause = Math.floor(
        Math.random() *
          (this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] -
            this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
        this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
      );
      logger.error(chalk.red(`? ${this.accountIndex} | Ping-pong swap error: ${e.message}. Sleeping ${pause} seconds...`));
      console.log(chalk.red(`[ERROR] ? Swap bot error: ${e.message} ?`));
      await new Promise((resolve) => setTimeout(resolve, pause * 1000));
      return false;
    }
  }
}

// Retry utilitas (digunakan oleh kedua bot)
async function retryAsync(fn, attempts = null, delay = 1.0, backoff = 2.0, defaultValue = null) {
  const configAttempts = config.SETTINGS.ATTEMPTS;
  const retryAttempts = attempts !== null ? attempts : configAttempts;
  let currentDelay = delay;

  for (let attempt = 0; attempt < retryAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < retryAttempts - 1) {
        logger.warn(
          chalk.yellow(
            `? Attempt ${attempt + 1}/${retryAttempts} failed for ${fn.name}: ${e.message}. Retrying in ${currentDelay.toFixed(1)} seconds...`
          )
        );
        console.log(chalk.yellow(`[RETRY] ? Attempt ${attempt + 1}/${retryAttempts} failed: ${e.message}. Retrying... ?`));
        await new Promise((resolve) => setTimeout(resolve, currentDelay * 1000));
        currentDelay *= backoff;
      } else {
        logger.error(chalk.red(`? All ${retryAttempts} attempts failed for ${fn.name}: ${e.message}`));
        console.log(chalk.red(`[ERROR] ? All retries failed: ${e.message} ?`));
        return defaultValue;
      }
    }
  }
  return defaultValue;
}

// Fungsi untuk menjalankan RandomTokenSender
async function runRandomTokenSender(tokenSender) {
  logger.info(chalk.cyan(`?? Starting STT Token Sender`));
  console.log(chalk.cyan(`[TOKEN SENDER] ?? Starting STT Token Sender ??`));
  const result = await retryAsync(() => tokenSender.sendTokens());
  console.log(chalk.green.bold(`STT Token Sender result: ${result}`));
  return result;
}

// Fungsi untuk menjalankan PingPongSwaps
async function runPingPongSwaps(pingPongSwaps) {
  logger.info(chalk.cyan(`?? Starting Ping Pong Swaps`));
  console.log(chalk.cyan(`[PING PONG SWAPS] ?? Starting Ping Pong Swaps ??`));
  const result = await retryAsync(() => pingPongSwaps.swaps());
  console.log(chalk.green.bold(`Ping Pong Swaps result: ${result}`));
  return result;
}

// Fungsi untuk menjalankan kombinasi acak
async function runCombinedRandom(tokenSender, pingPongSwaps, iterations) {
  console.log(chalk.bgMagenta.white.bold(`-------------------[ COMBINED RANDOM MODE - ${iterations} ITERATIONS ]-------------------`));

  for (let i = 0; i < iterations; i++) {
    // Cek saldo STT untuk Token Sender
    const sttBalance = await provider.getBalance(wallet.address);
    const sttBalanceEther = Number(ethers.formatEther(sttBalance));
    const hasSufficientSTT = sttBalanceEther >= config.SETTINGS.MINIMUM_BALANCE;

    // Cek saldo PING/PONG untuk Swaps
    const pingContract = new ethers.Contract(
      "0x33e7fab0a8a5da1a923180989bd617c9c2d1c493",
      [
        {
          name: "balanceOf",
          inputs: [{ name: "owner", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      wallet
    );
    const pongContract = new ethers.Contract(
      "0x9beaA0016c22B646Ac311Ab171270B0ECf23098F",
      [
        {
          name: "balanceOf",
          inputs: [{ name: "owner", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      wallet
    );
    const pingBalance = await pingContract.balanceOf(wallet.address);
    const pongBalance = await pongContract.balanceOf(wallet.address);
    const hasTokensToSwap = pingBalance > 0n || pongBalance > 0n;

    // Tentukan aksi yang mungkin berdasarkan saldo
    const possibleActions = [];
    if (hasSufficientSTT) possibleActions.push("send");
    if (hasTokensToSwap) possibleActions.push("swap");

    if (possibleActions.length === 0) {
      logger.error(
        chalk.red(`? No actions possible: Insufficient STT balance (${sttBalanceEther.toFixed(6)} STT) and no PING/PONG tokens. Stopping.`)
      );
      console.log(chalk.red(`[ERROR] ? No actions possible. Stopping combined mode. ?`));
      break;
    }

    // Pilih aksi secara acak
    const action = possibleActions[Math.floor(Math.random() * possibleActions.length)];
    logger.info(chalk.cyan(`?? Iteration ${i + 1}/${iterations}: Selected action - ${action === "send" ? "STT Token Sender" : "Ping Pong Swaps"}`));
    console.log(
      chalk.cyan(`[COMBINED] ?? Iteration ${i + 1}/${iterations}: Running ${action === "send" ? "STT Token Sender" : "Ping Pong Swaps"} ??`)
    );

    // Jalankan aksi yang dipilih
    if (action === "send") {
      await runRandomTokenSender(tokenSender);
    } else {
      await runPingPongSwaps(pingPongSwaps);
    }

    // Jeda antar iterasi, kecuali untuk iterasi terakhir
    if (i < iterations - 1) {
      const pause = Math.floor(
        Math.random() *
          (config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] -
            config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
        config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
      );
      logger.info(chalk.cyan(`? Waiting ${pause} seconds before next iteration...`));
      console.log(chalk.cyan(`? Waiting for next iteration...`));
      await new Promise((resolve) => setTimeout(resolve, pause * 1000));
    }
  }

  console.log(chalk.bgMagenta.white.bold("-------------------[ COMBINED RANDOM MODE COMPLETED ]-------------------"));
}

// Fungsi utama dengan menu
(async () => {
  try {
    console.log(chalk.bgMagenta.white.bold("-------------------[ COMBINED BOT MENU ]-------------------"));

    // Menu untuk memilih mode
    const modeResponse = await prompts({
      type: "select",
      name: "mode",
      message: chalk.cyan("Choose the bot mode to run:"),
      choices: [
        { title: "Run STT Token Sender (random.js)", value: "random" },
        { title: "Run Ping Pong Swaps (ping.js)", value: "ping" },
        { title: "Run Combined Random (Random + Ping)", value: "both" },
      ],
    });

    if (!modeResponse.mode) {
      console.log(chalk.red("Bot stopped. No mode selected."));
      return;
    }

    const tokenSender = new RandomTokenSender(wallet);
    const pingPongSwaps = new PingPongSwaps(wallet);

    if (modeResponse.mode === "random") {
      // Prompt untuk jumlah loop Token Sender (0 untuk unlimited)
      const randomLoopResponse = await prompts({
        type: "number",
        name: "loopCount",
        message: chalk.cyan("How many times do you want to loop the STT Token Sender? (Enter 0 for unlimited):"),
        validate: (value) => value >= 0 ? true : "Please enter a non-negative number",
      });

      console.log(chalk.bgMagenta.white.bold("-------------------[ STT TOKEN SENDER BOT - UNLIMITED LOOP ]-------------------"));
      console.log(chalk.cyan("?? Press Ctrl+C to stop the bot at any time."));
      let currentLoop = 0;

      while (randomLoopResponse.loopCount === 0 || currentLoop < randomLoopResponse.loopCount) {
        currentLoop++;
        logger.info(chalk.cyan(`?? Starting send loop ${currentLoop}`));
        console.log(chalk.cyan(`[LOOP] ?? Starting send loop ${currentLoop} ??`));

        const balance = await provider.getBalance(wallet.address);
        const balanceEther = Number(ethers.formatEther(balance));
        if (balanceEther < config.SETTINGS.MINIMUM_BALANCE) {
          logger.error(
            chalk.red(
              `? ${accountIndex} | Insufficient balance (${balanceEther.toFixed(6)} STT < ${config.SETTINGS.MINIMUM_BALANCE} STT). Stopping bot.`
            )
          );
          console.log(chalk.red(`[ERROR] ? Insufficient STT balance. Stopping bot. ?`));
          break;
        }

        const result = await retryAsync(() => tokenSender.sendTokens());
        console.log(chalk.green.bold(`Send loop ${currentLoop} result: ${result}`));

        if (randomLoopResponse.loopCount === 0 || currentLoop < randomLoopResponse.loopCount) {
          const pause = Math.floor(
            Math.random() *
              (config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] - config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
            config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
          );
          logger.info(chalk.cyan(`? Waiting ${pause} seconds before next loop...`));
          console.log(chalk.cyan(`? Waiting for next loop...`));
          await new Promise((resolve) => setTimeout(resolve, pause * 1000));
        }
      }

      console.log(chalk.bgMagenta.white.bold("-------------------[ TOKEN SENDER STOPPED ]-------------------"));
    } else if (modeResponse.mode === "ping") {
      // Prompt untuk jumlah loop Ping Pong Swaps
      const pingLoopResponse = await prompts({
        type: "number",
        name: "loopCount",
        message: chalk.cyan("How many times do you want to loop the Ping Pong Swaps? (Enter a positive number):"),
        validate: (value) => value > 0 ? true : "Please enter a positive number",
      });

      console.log(chalk.bgMagenta.white.bold(`-------------------[ STARTING ${pingLoopResponse.loopCount} SWAP LOOPS ]-------------------`));

      for (let i = 0; i < pingLoopResponse.loopCount; i++) {
        logger.info(chalk.cyan(`?? Starting swap loop ${i + 1}/${pingLoopResponse.loopCount}`));
        console.log(chalk.cyan(`[LOOP] ?? Starting swap loop ${i + 1}/${pingLoopResponse.loopCount} ??`));

        const result = await retryAsync(() => pingPongSwaps.swaps());
        console.log(chalk.green.bold(`Swap loop ${i + 1} result: ${result}`));

        if (i < pingLoopResponse.loopCount - 1) {
          const pause = Math.floor(
            Math.random() *
              (config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] -
                config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
            config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
          );
          logger.info(chalk.cyan(`? Waiting ${pause} seconds before next loop...`));
          console.log(chalk.cyan(`? Waiting for next loop...`));
          await new Promise((resolve) => setTimeout(resolve, pause * 1000));
        }
      }

      console.log(chalk.bgMagenta.white.bold("-------------------[ ALL SWAP LOOPS COMPLETED ]-------------------"));
    } else if (modeResponse.mode === "both") {
      // Prompt untuk jumlah iterasi kombinasi acak
      const combinedResponse = await prompts({
        type: "number",
        name: "iterations",
        message: chalk.cyan("How many random actions (send or swap) do you want to perform? (Enter a positive number):"),
        validate: (value) => value > 0 ? true : "Please enter a positive number",
      });

      await runCombinedRandom(tokenSender, pingPongSwaps, combinedResponse.iterations);
    }

    console.log(chalk.bgMagenta.white.bold("-------------------[ BOT EXECUTION COMPLETED ]-------------------"));
  } catch (e) {
    console.error(chalk.red.bold(`Error: ${e.message}`));
  }
})();

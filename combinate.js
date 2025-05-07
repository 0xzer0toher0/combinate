require("dotenv").config();
const { ethers } = require("ethers");
const winston = require("winston");
const chalk = require("chalk");
const prompts = require("prompts");

// Custom color palette
const colors = {
  info: chalk.hex("#00BCD4"), // Cyan for general info
  success: chalk.hex("#4CAF50"), // Green for success
  warning: chalk.hex("#FFC107"), // Yellow for warnings
  error: chalk.hex("#F44336"), // Red for errors
  header: chalk.hex("#E91E63").bold, // Magenta for headers
  secondary: chalk.hex("#B0BEC5"), // Gray for secondary info
};

// Configure logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      const levelColor = {
        info: colors.info,
        warn: colors.warning,
        error: colors.error,
      }[level] || colors.info;
      return levelColor(`${timestamp} [${level.toUpperCase()}]: ${message}`);
    })
  ),
  transports: [new winston.transports.Console()],
});

// Format wallet address for brevity
const formatAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`;

// Somnia Network provider
const provider = new ethers.JsonRpcProvider(
  "https://rpc.ankr.com/somnia_testnet/6e3fd81558cf77b928b06b38e9409b4677b637118114e83364486294d5ff4811"
);
const chainId = 50312;

// Initialize wallet
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error("PRIVATE_KEY not found in .env file");
}
const wallet = new ethers.Wallet(privateKey, provider);

// Explorer URL
const EXPLORER_URL_SOMNIA = "https://shannon-explorer.somnia.network/tx/";

// Developer recipients
const DEVS_RECIPIENTS = [
  "0xDA1feA7873338F34C6915A44028aA4D9aBA1346B",
  "0x018604C67a7423c03dE3057a49709aaD1D178B85",
  "0xcF8D30A5Ee0D9d5ad1D7087822bA5Bab1081FdB7",
  "0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5",
];

// Static configuration
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

// Static account index
const accountIndex = 1;

// RandomTokenSender class
class RandomTokenSender {
  constructor(wallet) {
    this.wallet = wallet;
    this.accountIndex = accountIndex;
    this.config = config;
  }

  async sendTokens() {
    try {
      logger.info(colors.header("=== STT Token Sender Started ==="));

      // Check balance
      const balance = await provider.getBalance(this.wallet.address);
      const balanceEther = Number(ethers.formatEther(balance));
      logger.info(colors.info(`Balance: ${balanceEther.toFixed(6)} STT at ${formatAddress(this.wallet.address)}`));

      if (balance === 0n) {
        logger.warn(colors.warning(`No STT balance to send for account ${this.accountIndex}`));
        return false;
      }

      // Determine number of transactions
      const { minTxs, maxTxs } = this.config.SOMNIA_NETWORK.SOMNIA_TOKEN_SENDER.NUMBER_OF_SENDS;
      const numTransactions = Math.floor(Math.random() * (maxTxs - minTxs + 1)) + minTxs;
      logger.info(colors.info(`Planning ${numTransactions} STT transactions for account ${this.accountIndex}`));

      let result = true;
      for (let i = 0; i < numTransactions; i++) {
        // Choose recipient
        const devChance = this.config.SOMNIA_NETWORK.SOMNIA_TOKEN_SENDER.SEND_ALL_TO_DEVS_CHANCE;
        let recipient;
        if (Math.random() * 100 <= devChance) {
          recipient = ethers.getAddress(DEVS_RECIPIENTS[Math.floor(Math.random() * DEVS_RECIPIENTS.length)]);
          logger.info(colors.info(`Tx ${i + 1}/${numTransactions}: Sending to dev wallet ${formatAddress(recipient)}`));
        } else {
          const randomWallet = ethers.Wallet.createRandom();
          recipient = randomWallet.address;
          logger.info(colors.info(`Tx ${i + 1}/${numTransactions}: Sending to random wallet ${formatAddress(recipient)}`));
        }

        // Send transaction
        result = await this._send(recipient);

        // Pause between transactions
        if (i < numTransactions - 1) {
          const pause =
            Math.random() *
              (this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[1] -
                this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[0]) +
            this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[0];
          logger.info(colors.secondary(`Pausing ${pause.toFixed(1)}s before next transaction`));
          await new Promise((resolve) => setTimeout(resolve, pause * 1000));
        }
      }

      logger.info(colors.header("=== STT Token Sender Completed ==="));
      return result;
    } catch (e) {
      logger.error(colors.error(`Send tokens failed for account ${this.accountIndex}: ${e.message}`));
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

      logger.info(colors.info(`Sending ${roundedAmount.toFixed(4)} STT to ${formatAddress(recipient)}`));

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
      logger.info(colors.success(`Tx sent: ${tx.hash}`));

      const receipt = await tx.wait();
      logger.info(colors.success(`Tx confirmed: ${EXPLORER_URL_SOMNIA}${receipt.transactionHash}`));
      return true;
    } catch (e) {
      const pause = Math.floor(
        Math.random() *
          (this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] -
            this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
        this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
      );
      logger.error(colors.error(`Send failed: ${e.message}. Retrying in ${pause}s`));
      await new Promise((resolve) => setTimeout(resolve, pause * 1000));
      throw e;
    }
  }
}

// PingPongSwaps class
class PingPongSwaps {
  constructor(wallet) {
    this.wallet = wallet;
    this.accountIndex = accountIndex;
    this.config = config;
  }

  async swaps() {
    try {
      logger.info(colors.header("=== Ping Pong Swap Started ==="));

      const pingTokenAddress = ethers.getAddress("0x33e7fab0a8a5da1a923180989bd617c9c2d1c493");
      const pongTokenAddress = ethers.getAddress("0x9beaA0016c22B646Ac311Ab171270B0ECf23098F");
      const routerAddress = ethers.getAddress("0x6AAC14f090A35EeA150705f72D90E4CDC4a49b2C");

      const tokenAbi = [
        // ... (unchanged token ABI)
      ];

      const routerAbi = [
        // ... (unchanged router ABI)
      ];

      const pingContract = new ethers.Contract(pingTokenAddress, tokenAbi, this.wallet);
      const pongContract = new ethers.Contract(pongTokenAddress, tokenAbi, this.wallet);

      let pingBalance = await pingContract.balanceOf(this.wallet.address);
      let pongBalance = await pongContract.balanceOf(this.wallet.address);

      logger.info(
        colors.info(
          `Balance: ${ethers.formatUnits(pingBalance, 18)} PING, ${ethers.formatUnits(pongBalance, 18)} PONG at ${formatAddress(
            this.wallet.address
          )}`
        )
      );

      if (pingBalance === 0n && pongBalance === 0n) {
        logger.warn(colors.warning(`No PING or PONG tokens to swap for account ${this.accountIndex}`));
        return false;
      }

      const { minTxs, maxTxs } = this.config.SOMNIA_NETWORK.SOMNIA_SWAPS.NUMBER_OF_SWAPS;
      const numSwaps = Math.floor(Math.random() * (maxTxs - minTxs + 1)) + minTxs;
      logger.info(colors.info(`Planning ${numSwaps} swaps for account ${this.accountIndex}`));

      let successCount = 0;

      for (let i = 0; i < numSwaps; i++) {
        if (i > 0) {
          pingBalance = await pingContract.balanceOf(this.wallet.address);
          pongBalance = await pongContract.balanceOf(this.wallet.address);
          logger.info(
            colors.info(
              `Balance updated: ${ethers.formatUnits(pingBalance, 18)} PING, ${ethers.formatUnits(pongBalance, 18)} PONG`
            )
          );
        }

        if (pingBalance === 0n && pongBalance === 0n) {
          logger.warn(colors.warning(`No tokens left to swap. Ending sequence.`));
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

        logger.info(colors.info(`Swap ${i + 1}/${numSwaps}: ${tokenInName} to ${tokenOutName}`));

        const minAmount = 100;
        const maxAmount = 100;
        const randomAmount = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
        const amountToSwap = ethers.parseUnits(randomAmount.toString(), 18);

        if (tokenBalance < amountToSwap) {
          logger.warn(
            colors.warning(
              `Insufficient ${tokenInName} balance (${ethers.formatUnits(tokenBalance, 18)} < ${randomAmount})`
            )
          );
          continue;
        }

        logger.info(colors.info(`Swapping ${randomAmount} ${tokenInName} to ${tokenOutName}`));

        const tokenContract = new ethers.Contract(tokenInAddress, tokenAbi, this.wallet);
        const currentAllowance = await tokenContract.allowance(this.wallet.address, routerAddress);

        if (currentAllowance < amountToSwap) {
          logger.info(colors.info(`Approving ${randomAmount} ${tokenInName} for router`));
          const approveTx = await tokenContract.approve(routerAddress, amountToSwap);
          await approveTx.wait();
          logger.info(colors.success(`Approved ${randomAmount} ${tokenInName}`));
        } else {
          logger.info(colors.success(`No approval needed for ${tokenInName}`));
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
          logger.info(colors.success(`Swap Tx sent: ${swapTx.hash}`));

          const receipt = await swapTx.wait();
          logger.info(colors.success(`Swap Tx confirmed: ${EXPLORER_URL_SOMNIA}${receipt.transactionHash}`));
          successCount++;
        } catch (e) {
          logger.error(colors.error(`Swap failed: ${e.message}`));
          continue;
        }

        if (i < numSwaps - 1) {
          const pause =
            Math.random() *
              (this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[1] -
                this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[0]) +
            this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[0];
          logger.info(colors.secondary(`Pausing ${pause.toFixed(1)}s before next swap`));
          await new Promise((resolve) => setTimeout(resolve, pause * 1000));
        }
      }

      logger.info(colors.header("=== Ping Pong Swap Completed ==="));
      return successCount > 0;
    } catch (e) {
      const pause = Math.floor(
        Math.random() *
          (this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] -
            this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
        this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
      );
      logger.error(colors.error(`Swap failed: ${e.message}. Retrying in ${pause}s`));
      await new Promise((resolve) => setTimeout(resolve, pause * 1000));
      return false;
    }
  }
}

// Retry utility
async function retryAsync(fn, attempts = null, delay = 1.0, backoff = 2.0, defaultValue = null) {
  const configAttempts = config.SETTINGS.ATTEMPTS;
  const retryAttempts = attempts !== null ? attempts : configAttempts;
  let currentDelay = delay;

  for (let attempt = 0; attempt < retryAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < retryAttempts - 1) {
        logger.warn(colors.warning(`Attempt ${attempt + 1}/${retryAttempts} failed: ${e.message}. Retrying in ${currentDelay.toFixed(1)}s`));
        await new Promise((resolve) => setTimeout(resolve, currentDelay * 1000));
        currentDelay *= backoff;
      } else {
        logger.error(colors.error(`All ${retryAttempts} attempts failed: ${e.message}`));
        return defaultValue;
      }
    }
  }
  return defaultValue;
}

// Run RandomTokenSender
async function runRandomTokenSender(tokenSender) {
  logger.info(colors.info("Starting STT Token Sender"));
  const result = await retryAsync(() => tokenSender.sendTokens());
  logger.info(colors.success(`STT Token Sender result: ${result}`));
  return result;
}

// Run PingPongSwaps
async function runPingPongSwaps(pingPongSwaps) {
  logger.info(colors.info("Starting Ping Pong Swaps"));
  const result = await retryAsync(() => pingPongSwaps.swaps());
  logger.info(colors.success(`Ping Pong Swaps result: ${result}`));
  return result;
}

// Run combined random mode
async function runCombinedRandom(tokenSender, pingPongSwaps, iterations) {
  logger.info(colors.header(`=== Combined Random Mode - ${iterations} Iterations ===`));

  for (let i = 0; i < iterations; i++) {
    // Check STT balance
    const sttBalance = await provider.getBalance(wallet.address);
    const sttBalanceEther = Number(ethers.formatEther(sttBalance));
    const hasSufficientSTT = sttBalanceEther >= config.SETTINGS.MINIMUM_BALANCE;

    // Check PING/PONG balance
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

    // Determine possible actions
    const possibleActions = [];
    if (hasSufficientSTT) possibleActions.push("send");
    if (hasTokensToSwap) possibleActions.push("swap");

    if (possibleActions.length === 0) {
      logger.error(
        colors.error(
          `No actions possible: Insufficient STT (${sttBalanceEther.toFixed(6)} STT) and no PING/PONG tokens`
        )
      );
      break;
    }

    // Select random action
    const action = possibleActions[Math.floor(Math.random() * possibleActions.length)];
    logger.info(
      colors.info(`Iteration ${i + 1}/${iterations}: Running ${action === "send" ? "STT Token Sender" : "Ping Pong Swaps"}`)
    );

    // Execute action
    if (action === "send") {
      await runRandomTokenSender(tokenSender);
    } else {
      await runPingPongSwaps(pingPongSwaps);
    }

    // Pause between iterations
    if (i < iterations - 1) {
      const pause = Math.floor(
        Math.random() *
          (config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] -
            config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
        config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
      );
      logger.info(colors.secondary(`Pausing ${pause}s before next iteration`));
      await new Promise((resolve) => setTimeout(resolve, pause * 1000));
    }
  }

  logger.info(colors.header("=== Combined Random Mode Completed ==="));
}

// Main function with menu
(async () => {
  try {
    logger.info(colors.header("=== Combined Bot Menu ==="));

    // Mode selection
    const modeResponse = await prompts({
      type: "select",
      name: "mode",
      message: colors.info("Choose bot mode:"),
      choices: [
        { title: "STT Token Sender", value: "random" },
        { title: "Ping Pong Swaps", value: "ping" },
        { title: "Combined Random (Send + Swap)", value: "both" },
      ],
    });

    if (!modeResponse.mode) {
      logger.error(colors.error("Bot stopped: No mode selected"));
      return;
    }

    const tokenSender = new RandomTokenSender(wallet);
    const pingPongSwaps = new PingPongSwaps(wallet);

    if (modeResponse.mode === "random") {
      // Prompt for loop count
      const randomLoopResponse = await prompts({
        type: "number",
        name: "loopCount",
        message: colors.info("Enter STT Token Sender loop count (0 for unlimited):"),
        validate: (value) => value >= 0 ? true : "Please enter a non-negative number",
      });

      logger.info(colors.header("=== STT Token Sender - Unlimited Loop ==="));
      logger.info(colors.info("Press Ctrl+C to stop"));

      let currentLoop = 0;
      while (randomLoopResponse.loopCount === 0 || currentLoop < randomLoopResponse.loopCount) {
        currentLoop++;
        logger.info(colors.info(`Starting send loop ${currentLoop}`));

        const balance = await provider.getBalance(wallet.address);
        const balanceEther = Number(ethers.formatEther(balance));
        if (balanceEther < config.SETTINGS.MINIMUM_BALANCE) {
          logger.error(
            colors.error(
              `Insufficient balance (${balanceEther.toFixed(6)} STT < ${config.SETTINGS.MINIMUM_BALANCE} STT)`
            )
          );
          break;
        }

        const result = await retryAsync(() => tokenSender.sendTokens());
        logger.info(colors.success(`Send loop ${currentLoop} result: ${result}`));

        if (randomLoopResponse.loopCount === 0 || currentLoop < randomLoopResponse.loopCount) {
          const pause = Math.floor(
            Math.random() *
              (config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] - config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
            config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
          );
          logger.info(colors.secondary(`Pausing ${pause}s before next loop`));
          await new Promise((resolve) => setTimeout(resolve, pause * 1000));
        }
      }

      logger.info(colors.header("=== STT Token Sender Stopped ==="));
    } else if (modeResponse.mode === "ping") {
      // Prompt for loop count
      const pingLoopResponse = await prompts({
        type: "number",
        name: "loopCount",
        message: colors.info("Enter Ping Pong Swaps loop count (positive number):"),
        validate: (value) => value > 0 ? true : "Please enter a positive number",
      });

      logger.info(colors.header(`=== Starting ${pingLoopResponse.loopCount} Swap Loops ===`));

      for (let i = 0; i < pingLoopResponse.loopCount; i++) {
        logger.info(colors.info(`Starting swap loop ${i + 1}/${pingLoopResponse.loopCount}`));

        const result = await retryAsync(() => pingPongSwaps.swaps());
        logger.info(colors.success(`Swap loop ${i + 1} result: ${result}`));

        if (i < pingLoopResponse.loopCount - 1) {
          const pause = Math.floor(
            Math.random() *
              (config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] -
                config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
            config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
          );
          logger.info(colors.secondary(`Pausing ${pause}s before next loop`));
          await new Promise((resolve) => setTimeout(resolve, pause * 1000));
        }
      }

      logger.info(colors.header("=== All Swap Loops Completed ==="));
    } else if (modeResponse.mode === "both") {
      // Prompt for iterations
      const combinedResponse = await prompts({
        type: "number",
        name: "iterations",
        message: colors.info("Enter number of random actions (send or swap):"),
        validate: (value) => value > 0 ? true : "Please enter a positive number",
      });

      await runCombinedRandom(tokenSender, pingPongSwaps, combinedResponse.iterations);
    }

    logger.info(colors.header("=== Bot Execution Completed ==="));
  } catch (e) {
    logger.error(colors.error(`Bot error: ${e.message}`));
  }
})();

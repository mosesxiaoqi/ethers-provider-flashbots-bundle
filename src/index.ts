import { BlockTag, TransactionReceipt, TransactionRequest } from '@ethersproject/abstract-provider'
import { Networkish } from '@ethersproject/networks'
import { BaseProvider } from '@ethersproject/providers'
import { ConnectionInfo, fetchJson } from '@ethersproject/web'
import { BigNumber, ethers, providers, Signer } from 'ethers'
import { id, keccak256 } from 'ethers/lib/utils'
import { serialize } from '@ethersproject/transactions'

export const DEFAULT_FLASHBOTS_RELAY = 'https://relay.flashbots.net'
export const BASE_FEE_MAX_CHANGE_DENOMINATOR = 8

export enum FlashbotsBundleResolution {
  BundleIncluded,    //表示该 bundle 已成功被包含在目标区块中
  BlockPassedWithoutInclusion,   //目标区块已经生成，但是该 bundle 未能被包含在其中（交易失败）
  AccountNonceTooHigh  //bundle 中使用的账户 nonce 值已经失效（比链上当前 nonce 值高），意味着该交易无法执行
}

export enum FlashbotsTransactionResolution {
  TransactionIncluded,  //表示私有交易已成功被包含在链上区块中并得到确认
  TransactionDropped   // 表示私有交易未能被打包进区块，已被舍弃
}

export enum FlashbotsBundleConflictType {
  NoConflict,   //表示 bundle 执行没有发生任何冲突
  NonceCollision,   //两个不同交易使用了相同的 nonce 值，导致冲突
  Error,    //执行过程中发生了错误
  CoinbasePayment,  //与其他交易在支付给矿工的费用上发生冲突
  GasUsed,   //与其他交易在 gas 使用量上发生冲突
  NoBundlesInBlock   //目标区块中没有任何 bundle
}

export interface FlashbotsBundleRawTransaction {
  signedTransaction: string  // 已签名的交易数据，十六进制字符串格式
}

export interface FlashbotsBundleTransaction {
  transaction: TransactionRequest   //未签名的交易
  signer: Signer   //签名者
}

export interface FlashbotsOptions {
  minTimestamp?: number // 最小时间戳  指定 bundle 执行的最早时间戳 可以用来延迟 bundle 的执行
  maxTimestamp?: number // 最大时间戳 指定 bundle 执行的最晚时间戳  设置 bundle 的有效期限
  revertingTxHashes?: Array<string>  // 可以回滚的交易哈希数组  指定允许回滚的交易哈希列表 当这些交易失败时允许回滚
  replacementUuid?: string  // 替换标识符  用于替换先前提交的 bundle 的唯一标识符  可以用来更新或取消之前的 bundle
}

export interface TransactionAccountNonce {
  hash: string  //存储交易的唯一标识哈希值
  signedTransaction: string  //存储已签名的完整交易数据
  account: string  //交易发送者的以太坊地址
  nonce: number  //交易的 nonce 值，用于确保交易顺序
}

export interface FlashbotsTransactionResponse {
  // 包含在 bundle 中的所有交易信息数组
  bundleTransactions: Array<TransactionAccountNonce>
  // 等待 bundle 执行完成的异步方法
  wait: () => Promise<FlashbotsBundleResolution>
  // 模拟执行 bundle 的异步方法
  simulate: () => Promise<SimulationResponse>
  // 获取所有交易收据的异步方法
  receipts: () => Promise<Array<TransactionReceipt>>
  // bundle 的唯一标识哈希值
  bundleHash: string
}

export interface FlashbotsPrivateTransactionResponse {
  transaction: TransactionAccountNonce
  wait: () => Promise<FlashbotsTransactionResolution>
  simulate: () => Promise<SimulationResponse>
  receipts: () => Promise<Array<TransactionReceipt>>
}

export interface TransactionSimulationBase {
  txHash: string       // 交易哈希
  gasUsed: number      // 实际使用的 gas 量
  gasFees: string      // gas 费用总额
  gasPrice: string     // gas 价格
  toAddress: string    // 接收方地址
  fromAddress: string  // 发送方地址
  coinbaseDiff: string // 矿工获得的收益差值
}

export interface TransactionSimulationSuccess extends TransactionSimulationBase {
  value: string  // 交易发送的 ETH 数量
  ethSentToCoinbase: string  // 直接发送给矿工的 ETH 数量
  coinbaseDiff: string
}

export interface TransactionSimulationRevert extends TransactionSimulationBase {
  error: string  // 错误信息
  revert: string // 回滚原因
}

export type TransactionSimulation = TransactionSimulationSuccess | TransactionSimulationRevert

//接口定义了 Flashbots 中继节点返回错误时的标准格式
export interface RelayResponseError {
  error: {
    message: string  // 错误信息描述
    code: number     // 错误代码
  }
}

// 接口定义了交易包（bundle）模拟执行成功后的响应格式
export interface SimulationResponseSuccess {
  bundleGasPrice: BigNumber  // bundle 的 gas 价格
  bundleHash: string         // bundle 的唯一标识哈希
  coinbaseDiff: BigNumber    // 矿工收益的变化值
  ethSentToCoinbase: BigNumber  // 直接发送给矿工的 ETH 数量
  gasFees: BigNumber         // gas 费用总额
  results: Array<TransactionSimulation>  // 所有交易的模拟结果数组
  totalGasUsed: number        // bundle 中所有交易使用的总 gas 量
  stateBlockNumber: number    // 模拟执行时的状态区块号
  firstRevert?: TransactionSimulation  // 首个回滚的交易（如果有）
}

export type SimulationResponse = SimulationResponseSuccess | RelayResponseError

export type FlashbotsTransaction = FlashbotsTransactionResponse | RelayResponseError

export type FlashbotsPrivateTransaction = FlashbotsPrivateTransactionResponse | RelayResponseError

export interface GetUserStatsResponseSuccess {
  is_high_priority: boolean  // 用户是否为高优先级用户
  all_time_miner_payments: string   // 历史支付给矿工的总金额
  all_time_gas_simulated: string    // 历史模拟使用的总 gas 量
  last_7d_miner_payments: string    // 最近7天支付给矿工的金额
  last_7d_gas_simulated: string     // 最近7天模拟使用的 gas 量
  last_1d_miner_payments: string    // 最近1天支付给矿工的金额
  last_1d_gas_simulated: string     // 最近1天模拟使用的 gas 量
}

export interface GetUserStatsResponseSuccessV2 {
  isHighPriority: boolean
  allTimeValidatorPayments: string
  allTimeGasSimulated: string
  last7dValidatorPayments: string
  last7dGasSimulated: string
  last1dValidatorPayments: string
  last1dGasSimulated: string
}

export type GetUserStatsResponse = GetUserStatsResponseSuccess | RelayResponseError
export type GetUserStatsResponseV2 = GetUserStatsResponseSuccessV2 | RelayResponseError


//接口用于记录 builder 的公钥和时间戳信息
//接口主要用在 bundle 状态查询的响应中，用于追踪 bundle 在不同 builder 节点上的处理时间
interface PubKeyTimestamp {
  pubkey: string   // builder 的公钥
  timestamp: string  // 时间戳
}

export interface GetBundleStatsResponseSuccess {
  isSimulated: boolean   // bundle 是否已经过模拟测试
  isSentToMiners: boolean // bundle 是否已发送给矿工
  isHighPriority: boolean // 是否为高优先级 bundle
  simulatedAt: string  // bundle 模拟测试的时间
  submittedAt: string  // bundle 提交时间
  sentToMinersAt: string  // bundle 发送给矿工的时间
  consideredByBuildersAt: Array<PubKeyTimestamp>  // bundle 被 builder 节点处理的时间戳数组
  sealedByBuildersAt: Array<PubKeyTimestamp> // bundle 被 builder 节点封装的时间戳数组
}

export interface GetBundleStatsResponseSuccessV2 {
  isSimulated: boolean
  isHighPriority: boolean
  simulatedAt: string
  receivedAt: string
  consideredByBuildersAt: Array<PubKeyTimestamp>
  sealedByBuildersAt: Array<PubKeyTimestamp>
}

export type GetBundleStatsResponse = GetBundleStatsResponseSuccess | RelayResponseError
export type GetBundleStatsResponseV2 = GetBundleStatsResponseSuccessV2 | RelayResponseError

//接口定义了从 Flashbots Blocks API 返回的单笔交易详情
interface BlocksApiResponseTransactionDetails {
  // 交易基本信息
  transaction_hash: string      // 交易哈希
  tx_index: number             // 交易在区块中的索引
  bundle_type: 'rogue' | 'flashbots' | 'mempool'  // 交易类型
  bundle_index: number         // 在 bundle 中的索引
  block_number: number         // 区块号
  
  // 地址信息
  eoa_address: string         // 发送方外部账户地址
  to_address: string          // 接收方地址
  
  // Gas 相关
  gas_used: number           // 使用的 gas 量
  gas_price: string          // gas 价格
  
  // 收益相关
  coinbase_transfer: string           // 转给矿工的金额
  eth_sent_to_fee_recipient: string   // 发送给收费接收者的 ETH
  total_miner_reward: string          // 矿工总收益 coinbase_transfer（直接转账）
                                          // gas 费用中的 priority fee（优先费）
                                          // 其他可能的收益
  fee_recipient_eth_diff: string      // 收费接收者的 ETH 变化
}


interface BlocksApiResponseBlockDetails {
  // 区块基本信息
  block_number: number                // 区块号
  
  // 收益接收方信息
  fee_recipient: string              // 收费接收者地址
  fee_recipient_eth_diff: string     // 收费接收者的 ETH 余额变化
  
  // 矿工相关信息
  miner: string                      // 矿工地址
  miner_reward: string               // 矿工获得的总奖励
  coinbase_transfers: string         // 转给矿工的直接转账总额
  eth_sent_to_fee_recipient: string  // 发送给收费接收者的 ETH
  
  // Gas 相关
  gas_used: number                   // 区块使用的总 gas
  gas_price: string                  // 区块的平均 gas 价格
  
  // 交易列表
  transactions: Array<BlocksApiResponseTransactionDetails> // 区块中的所有交易
}

export interface BlocksApiResponse {
  latest_block_number: number  // 最新区块号
  blocks: Array<BlocksApiResponseBlockDetails>  // 区块详情数组
}

//接口用于描述 Flashbots bundle 发生冲突时的详细信息
//接口主要用于诊断和分析 Flashbots bundle 执行失败的原因，帮助开发者优化其 MEV 策略
export interface FlashbotsBundleConflict {
  // 与当前 bundle 发生冲突的其他 bundle 中的交易详情
  conflictingBundle: Array<BlocksApiResponseTransactionDetails>
  // 初始模拟执行的结果
  initialSimulation: SimulationResponseSuccess
  // 冲突类型
  conflictType: FlashbotsBundleConflictType
}

export interface FlashbotsGasPricing {
  txCount: number
  gasUsed: number
  gasFeesPaidBySearcher: BigNumber
  priorityFeesReceivedByMiner: BigNumber
  ethSentToCoinbase: BigNumber
  effectiveGasPriceToSearcher: BigNumber
  effectivePriorityFeeToMiner: BigNumber
}

export interface FlashbotsBundleConflictWithGasPricing extends FlashbotsBundleConflict {
  targetBundleGasPricing: FlashbotsGasPricing
  conflictingBundleGasPricing?: FlashbotsGasPricing
}

export interface FlashbotsCancelBidResponseSuccess {
  bundleHashes: string[]
}

export type FlashbotsCancelBidResponse = FlashbotsCancelBidResponseSuccess | RelayResponseError

type RpcParams = Array<string[] | string | number | Record<string, unknown>>

/** 超时时间主要用在以下场景  等待 bundle 被打包进区块  等待单笔交易被确认*/
const TIMEOUT_MS = 5 * 60 * 1000

export class FlashbotsBundleProvider extends providers.JsonRpcProvider {
  private genericProvider: BaseProvider
  private authSigner: Signer
  private connectionInfo: ConnectionInfo

  constructor(genericProvider: BaseProvider, authSigner: Signer, connectionInfoOrUrl: ConnectionInfo, network: Networkish) {
    super(connectionInfoOrUrl, network)
    this.genericProvider = genericProvider
    this.authSigner = authSigner
    this.connectionInfo = connectionInfoOrUrl
  }

  //速率限制处理
  //当 API 请求被限流时会触发此回调
  static async throttleCallback(): Promise<boolean> {
    console.warn('Rate limited')
    return false
  }

  /**
   * Creates a new Flashbots provider.
   * @param genericProvider ethers.js mainnet provider
   * @param authSigner account to sign bundles
   * @param connectionInfoOrUrl (optional) connection settings
   * @param network (optional) network settings
   *
   * @example
   * ```typescript
   * const {providers, Wallet} = require("ethers")
   * const {FlashbotsBundleProvider} = require("@flashbots/ethers-provider-bundle")
   * const authSigner = Wallet.createRandom()
   * const provider = new providers.JsonRpcProvider("http://localhost:8545")
   * const fbProvider = await FlashbotsBundleProvider.create(provider, authSigner)
   * ```
   */
  static async create(
    genericProvider: BaseProvider,
    authSigner: Signer,
    connectionInfoOrUrl?: ConnectionInfo | string,
    network?: Networkish
  ): Promise<FlashbotsBundleProvider> {
    const connectionInfo: ConnectionInfo =
      typeof connectionInfoOrUrl === 'string' || typeof connectionInfoOrUrl === 'undefined'
        ? {
            url: connectionInfoOrUrl || DEFAULT_FLASHBOTS_RELAY
          }
        : {
            ...connectionInfoOrUrl
          }
    if (connectionInfo.headers === undefined) connectionInfo.headers = {}
    connectionInfo.throttleCallback = FlashbotsBundleProvider.throttleCallback
    const networkish: Networkish = {
      chainId: 0,
      name: ''
    }
    if (typeof network === 'string') {
      networkish.name = network
    } else if (typeof network === 'number') {
      networkish.chainId = network
    } else if (typeof network === 'object') {
      networkish.name = network.name
      networkish.chainId = network.chainId
    }

    if (networkish.chainId === 0) {
      networkish.chainId = (await genericProvider.getNetwork()).chainId
    }

    return new FlashbotsBundleProvider(genericProvider, authSigner, connectionInfo, networkish)
  }

  /**
   * Calculates maximum base fee in a future block.
   * @param baseFee current base fee
   * @param blocksInFuture number of blocks in the future
   */
  static getMaxBaseFeeInFutureBlock(baseFee: BigNumber, blocksInFuture: number): BigNumber {
    let maxBaseFee = BigNumber.from(baseFee)
    for (let i = 0; i < blocksInFuture; i++) {
      maxBaseFee = maxBaseFee.mul(1125).div(1000).add(1)
    }
    return maxBaseFee
  }

  /**
   * Calculates base fee for the next block.
   * @param currentBaseFeePerGas base fee of current block (wei)
   * @param currentGasUsed gas used by tx in simulation
   * @param currentGasLimit gas limit of transaction
   */
  static getBaseFeeInNextBlock(currentBaseFeePerGas: BigNumber, currentGasUsed: BigNumber, currentGasLimit: BigNumber): BigNumber {
    const currentGasTarget = currentGasLimit.div(2)

    if (currentGasUsed.eq(currentGasTarget)) {
      return currentBaseFeePerGas
    } else if (currentGasUsed.gt(currentGasTarget)) {
      const gasUsedDelta = currentGasUsed.sub(currentGasTarget)
      const baseFeePerGasDelta = currentBaseFeePerGas.mul(gasUsedDelta).div(currentGasTarget).div(BASE_FEE_MAX_CHANGE_DENOMINATOR)

      return currentBaseFeePerGas.add(baseFeePerGasDelta)
    } else {
      const gasUsedDelta = currentGasTarget.sub(currentGasUsed)
      const baseFeePerGasDelta = currentBaseFeePerGas.mul(gasUsedDelta).div(currentGasTarget).div(BASE_FEE_MAX_CHANGE_DENOMINATOR)

      return currentBaseFeePerGas.sub(baseFeePerGasDelta)
    }
  }

  /**
   * Calculates a bundle hash locally.
   * @param txHashes hashes of transactions in the bundle
   */
  static generateBundleHash(txHashes: Array<string>): string {
    // 1. 移除每个交易哈希的 "0x" 前缀并连接
    const concatenatedHashes = txHashes.map((txHash) => txHash.slice(2)).join('')
    // 2. 添加 "0x" 前缀并计算 keccak256 哈希
    return keccak256(`0x${concatenatedHashes}`)
  }

  /**
   * Sends a signed flashbots bundle to Flashbots Relay.
   * @param signedBundledTransactions array of raw signed transactions
   * @param targetBlockNumber block to target for bundle inclusion
   * @param opts (optional) settings
   * @returns callbacks for handling results, and the bundle hash
   *
   * @example
   * ```typescript
   * const bundle: Array<FlashbotsBundleRawTransaction> = [
   *    {signedTransaction: "0x02..."},
   *    {signedTransaction: "0x02..."},
   * ]
   * const signedBundle = await fbProvider.signBundle(bundle)
   * const blockNum = await provider.getBlockNumber()
   * const bundleRes = await fbProvider.sendRawBundle(signedBundle, blockNum + 1)
   * const success = (await bundleRes.wait()) === FlashbotsBundleResolution.BundleIncluded
   * ```
   */
  public async sendRawBundle(
    signedBundledTransactions: Array<string>,
    targetBlockNumber: number,
    opts?: FlashbotsOptions
  ): Promise<FlashbotsTransaction> {
    const params = {
      txs: signedBundledTransactions,
      blockNumber: `0x${targetBlockNumber.toString(16)}`,
      minTimestamp: opts?.minTimestamp,
      maxTimestamp: opts?.maxTimestamp,
      revertingTxHashes: opts?.revertingTxHashes,
      replacementUuid: opts?.replacementUuid
    }

    const request = JSON.stringify(this.prepareRelayRequest('eth_sendBundle', [params]))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    const bundleTransactions = signedBundledTransactions.map((signedTransaction) => {
      const transactionDetails = ethers.utils.parseTransaction(signedTransaction)
      return {
        signedTransaction,
        hash: ethers.utils.keccak256(signedTransaction),
        account: transactionDetails.from || '0x0',
        nonce: transactionDetails.nonce
      }
    })

    return {
      bundleTransactions,
      wait: () => this.waitForBundleInclusion(bundleTransactions, targetBlockNumber, TIMEOUT_MS),
      simulate: () =>
        this.simulate(
          bundleTransactions.map((tx) => tx.signedTransaction),
          targetBlockNumber,
          undefined,
          opts?.minTimestamp
        ),
      receipts: () => this.fetchReceipts(bundleTransactions),
      bundleHash: response?.result?.bundleHash
    }
  }

  /**
   * Sends a bundle to Flashbots, supports multiple transaction interfaces.
   * @param bundledTransactions array of transactions, either signed or provided with a signer.
   * @param targetBlockNumber block to target for bundle inclusion
   * @param opts (optional) settings
   * @returns callbacks for handling results, and the bundle hash
   */
  public async sendBundle(
    bundledTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>,
    targetBlockNumber: number,
    opts?: FlashbotsOptions
  ): Promise<FlashbotsTransaction> {
    const signedTransactions = await this.signBundle(bundledTransactions)
    return this.sendRawBundle(signedTransactions, targetBlockNumber, opts)
  }

  /** Cancel any bundles submitted with the given `replacementUuid`
   * @param replacementUuid specified in `sendBundle`
   * @returns bundle hashes of the cancelled bundles
   */
  public async cancelBundles(replacementUuid: string): Promise<FlashbotsCancelBidResponse> {
    const params = {
      replacementUuid: replacementUuid
    }

    const request = JSON.stringify(this.prepareRelayRequest('eth_cancelBundle', [params]))
    const response = await this.request(request)

    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }
    return {
      bundleHashes: response.result
    }
  }

  /**
   * Sends a single private transaction to Flashbots.
   * @param transaction transaction, either signed or provided with a signer
   * @param opts (optional) settings
   * @returns callbacks for handling results, and transaction data
   *
   * @example
   * ```typescript
   * const tx: FlashbotsBundleRawTransaction = {signedTransaction: "0x02..."}
   * const blockNum = await provider.getBlockNumber()
   * // try sending for 5 blocks
   * const response = await fbProvider.sendPrivateTransaction(tx, {maxBlockNumber: blockNum + 5})
   * const success = (await response.wait()) === FlashbotsTransactionResolution.TransactionIncluded
   * ```
   */
  public async sendPrivateTransaction(
    transaction: FlashbotsBundleTransaction | FlashbotsBundleRawTransaction,
    opts?: {
      maxBlockNumber?: number
      simulationTimestamp?: number
    }
  ): Promise<FlashbotsPrivateTransaction> {
    const startBlockNumberPromise = this.genericProvider.getBlockNumber()

    let signedTransaction: string
    if ('signedTransaction' in transaction) {
      signedTransaction = transaction.signedTransaction
    } else {
      signedTransaction = await transaction.signer.signTransaction(transaction.transaction)
    }

    const params = {
      tx: signedTransaction,
      maxBlockNumber: opts?.maxBlockNumber
    }
    const request = JSON.stringify(this.prepareRelayRequest('eth_sendPrivateTransaction', [params]))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    const transactionDetails = ethers.utils.parseTransaction(signedTransaction)
    const privateTransaction = {
      signedTransaction: signedTransaction,
      hash: ethers.utils.keccak256(signedTransaction),
      account: transactionDetails.from || '0x0',
      nonce: transactionDetails.nonce
    }
    const startBlockNumber = await startBlockNumberPromise

    return {
      transaction: privateTransaction,
      wait: () => this.waitForTxInclusion(privateTransaction.hash, opts?.maxBlockNumber || startBlockNumber + 25, TIMEOUT_MS),
      simulate: () => this.simulate([privateTransaction.signedTransaction], startBlockNumber, undefined, opts?.simulationTimestamp),
      receipts: () => this.fetchReceipts([privateTransaction])
    }
  }

  /**
   * Attempts to cancel a pending private transaction.
   *
   * **_Note_**: This function removes the transaction from the Flashbots
   * bundler, but miners may still include it if they have received it already.
   * @param txHash transaction hash corresponding to pending tx
   * @returns true if transaction was cancelled successfully
   *
   * @example
   * ```typescript
   * const pendingTxHash = (await fbProvider.sendPrivateTransaction(tx)).transaction.hash
   * const isTxCanceled = await fbProvider.cancelPrivateTransaction(pendingTxHash)
   * ```
   */
  public async cancelPrivateTransaction(txHash: string): Promise<boolean | RelayResponseError> {
    const params = {
      txHash
    }
    const request = JSON.stringify(this.prepareRelayRequest('eth_cancelPrivateTransaction', [params]))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    return true
  }

  /**
   * Signs a Flashbots bundle with this provider's `authSigner` key.
   * @param bundledTransactions
   * @returns signed bundle
   *
   * @example
   * ```typescript
   * const bundle: Array<FlashbotsBundleRawTransaction> = [
   *    {signedTransaction: "0x02..."},
   *    {signedTransaction: "0x02..."},
   * ]
   * const signedBundle = await fbProvider.signBundle(bundle)
   * const blockNum = await provider.getBlockNumber()
   * const simResult = await fbProvider.simulate(signedBundle, blockNum + 1)
   * ```
   */
  public async signBundle(bundledTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>): Promise<Array<string>> {
    const nonces: { [address: string]: BigNumber } = {}
    const signedTransactions = new Array<string>()
    for (const tx of bundledTransactions) {
      if ('signedTransaction' in tx) {
        // in case someone is mixing pre-signed and signing transactions, decode to add to nonce object
        const transactionDetails = ethers.utils.parseTransaction(tx.signedTransaction)
        if (transactionDetails.from === undefined) throw new Error('Could not decode signed transaction')
        nonces[transactionDetails.from] = BigNumber.from(transactionDetails.nonce + 1)
        signedTransactions.push(tx.signedTransaction)
        continue
      }
      const transaction = { ...tx.transaction }
      const address = await tx.signer.getAddress()
      if (typeof transaction.nonce === 'string') throw new Error('Bad nonce')
      const nonce =
        transaction.nonce !== undefined
          ? BigNumber.from(transaction.nonce)
          : nonces[address] || BigNumber.from(await this.genericProvider.getTransactionCount(address, 'latest'))
      nonces[address] = nonce.add(1)
      if (transaction.nonce === undefined) transaction.nonce = nonce
      if ((transaction.type == null || transaction.type == 0) && transaction.gasPrice === undefined)
        transaction.gasPrice = BigNumber.from(0)
      if (transaction.gasLimit === undefined) transaction.gasLimit = await tx.signer.estimateGas(transaction) // TODO: Add target block number and timestamp when supported by geth
      signedTransactions.push(await tx.signer.signTransaction(transaction))
    }
    return signedTransactions
  }

  /**
   * Watches for a specific block to see if a bundle was included in it.
   * @param transactionAccountNonces bundle transactions
   * @param targetBlockNumber block number to check for bundle inclusion
   * @param timeout ms
   */
  private waitForBundleInclusion(transactionAccountNonces: Array<TransactionAccountNonce>, targetBlockNumber: number, timeout: number) {
    return new Promise<FlashbotsBundleResolution>((resolve, reject) => {
      let timer: NodeJS.Timer | null = null
      let done = false

      const minimumNonceByAccount = transactionAccountNonces.reduce((acc, accountNonce) => {
        if (accountNonce.nonce > 0) {
          if (!acc[accountNonce.account] || accountNonce.nonce < acc[accountNonce.account]) {
            acc[accountNonce.account] = accountNonce.nonce
          }
        }
        return acc
      }, {} as { [account: string]: number })

      const handler = async (blockNumber: number) => {
        if (blockNumber < targetBlockNumber) {
          const noncesValid = await Promise.all(
            Object.entries(minimumNonceByAccount).map(async ([account, nonce]) => {
              const transactionCount = await this.genericProvider.getTransactionCount(account)
              return nonce >= transactionCount
            })
          )
          const allNoncesValid = noncesValid.every(Boolean)
          if (allNoncesValid) return
          // target block not yet reached, but nonce has become invalid
          resolve(FlashbotsBundleResolution.AccountNonceTooHigh)
        } else {
          const block = await this.genericProvider.getBlock(targetBlockNumber)
          // check bundle against block:
          const blockTransactionsHash: { [key: string]: boolean } = {}
          for (const bt of block.transactions) {
            blockTransactionsHash[bt] = true
          }
          const bundleIncluded = transactionAccountNonces.every((transaction) => blockTransactionsHash[transaction.hash])
          resolve(bundleIncluded ? FlashbotsBundleResolution.BundleIncluded : FlashbotsBundleResolution.BlockPassedWithoutInclusion)
        }

        if (timer) {
          clearTimeout(timer)
        }
        if (done) {
          return
        }
        done = true
        this.genericProvider.removeListener('block', handler)
      }
      this.genericProvider.on('block', handler)

      if (timeout > 0) {
        timer = setTimeout(() => {
          if (done) {
            return
          }
          timer = null
          done = true

          this.genericProvider.removeListener('block', handler)
          reject('Timed out')
        }, timeout)
        if (timer.unref) {
          timer.unref()
        }
      }
    })
  }

  /**
   * Waits for a transaction to be included on-chain.
   * @param transactionHash
   * @param maxBlockNumber highest block number to check before stopping
   * @param timeout ms
   */
  private waitForTxInclusion(transactionHash: string, maxBlockNumber: number, timeout: number) {
    return new Promise<FlashbotsTransactionResolution>((resolve, reject) => {
      let timer: NodeJS.Timer | null = null
      let done = false

      // runs on new block event
      const handler = async (blockNumber: number) => {
        if (blockNumber <= maxBlockNumber) {
          // check tx status on mainnet
          const sentTxStatus = await this.genericProvider.getTransaction(transactionHash)
          if (sentTxStatus && sentTxStatus.confirmations >= 1) {
            resolve(FlashbotsTransactionResolution.TransactionIncluded)
          } else {
            return
          }
        } else {
          // tx not included in specified range, bail
          this.genericProvider.removeListener('block', handler)
          resolve(FlashbotsTransactionResolution.TransactionDropped)
        }

        if (timer) {
          clearTimeout(timer)
        }
        if (done) {
          return
        }
        done = true
        this.genericProvider.removeListener('block', handler)
      }

      this.genericProvider.on('block', handler)

      // time out if we've been trying for too long
      if (timeout > 0) {
        timer = setTimeout(() => {
          if (done) {
            return
          }
          timer = null
          done = true

          this.genericProvider.removeListener('block', handler)
          reject('Timed out')
        }, timeout)
        if (timer.unref) {
          timer.unref()
        }
      }
    })
  }

  /**
   * Gets stats for provider instance's `authSigner` address.
   * @deprecated use {@link getUserStatsV2} instead.
   */
  public async getUserStats(): Promise<GetUserStatsResponse> {
    const blockDetails = await this.genericProvider.getBlock('latest')
    const evmBlockNumber = `0x${blockDetails.number.toString(16)}`
    const params = [evmBlockNumber]
    const request = JSON.stringify(this.prepareRelayRequest('flashbots_getUserStats', params))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    return response.result
  }

  /**
   * Gets stats for provider instance's `authSigner` address.
   */
  public async getUserStatsV2(): Promise<GetUserStatsResponseV2> {
    const blockDetails = await this.genericProvider.getBlock('latest')
    const evmBlockNumber = `0x${blockDetails.number.toString(16)}`
    const params = [{ blockNumber: evmBlockNumber }]
    const request = JSON.stringify(this.prepareRelayRequest('flashbots_getUserStatsV2', params))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    return response.result
  }

  /**
   * Gets information about a specific bundle.
   * @param bundleHash hash of bundle to investigate
   * @param blockNumber block in which the bundle should be included
   * @deprecated use {@link getBundleStatsV2} instead.
   */
  public async getBundleStats(bundleHash: string, blockNumber: number): Promise<GetBundleStatsResponse> {
    const evmBlockNumber = `0x${blockNumber.toString(16)}`

    const params = [{ bundleHash, blockNumber: evmBlockNumber }]
    const request = JSON.stringify(this.prepareRelayRequest('flashbots_getBundleStats', params))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    return response.result
  }

  /**
   * Gets information about a specific bundle.
   * @param bundleHash hash of bundle to investigate
   * @param blockNumber block in which the bundle should be included
   */
  public async getBundleStatsV2(bundleHash: string, blockNumber: number): Promise<GetBundleStatsResponseV2> {
    const evmBlockNumber = `0x${blockNumber.toString(16)}`

    const params = [{ bundleHash, blockNumber: evmBlockNumber }]
    const request = JSON.stringify(this.prepareRelayRequest('flashbots_getBundleStatsV2', params))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    return response.result
  }

  /**
   * Simluates a bundle on a given block.
   * @param signedBundledTransactions signed Flashbots bundle
   * @param blockTag block tag to simulate against, can use "latest"
   * @param stateBlockTag (optional) simulated block state tag
   * @param blockTimestamp (optional) simulated timestamp
   *
   * @example
   * ```typescript
   * const bundle: Array<FlashbotsBundleRawTransaction> = [
   *    {signedTransaction: "0x1..."},
   *    {signedTransaction: "0x2..."},
   * ]
   * const signedBundle = await fbProvider.signBundle(bundle)
   * const blockNum = await provider.getBlockNumber()
   * const simResult = await fbProvider.simulate(signedBundle, blockNum + 1)
   * ```
   */
  public async simulate(
    signedBundledTransactions: Array<string>,
    blockTag: BlockTag,
    stateBlockTag?: BlockTag,
    blockTimestamp?: number,
    coinbase?: string
  ): Promise<SimulationResponse> {
    let evmBlockNumber: string
    if (typeof blockTag === 'number') {
      evmBlockNumber = `0x${blockTag.toString(16)}`
    } else {
      const blockTagDetails = await this.genericProvider.getBlock(blockTag)
      const blockDetails = blockTagDetails !== null ? blockTagDetails : await this.genericProvider.getBlock('latest')
      evmBlockNumber = `0x${blockDetails.number.toString(16)}`
    }

    let evmBlockStateNumber: string
    if (typeof stateBlockTag === 'number') {
      evmBlockStateNumber = `0x${stateBlockTag.toString(16)}`
    } else if (!stateBlockTag) {
      evmBlockStateNumber = 'latest'
    } else {
      evmBlockStateNumber = stateBlockTag
    }

    const params: RpcParams = [
      {
        txs: signedBundledTransactions,
        blockNumber: evmBlockNumber,
        stateBlockNumber: evmBlockStateNumber,
        timestamp: blockTimestamp,
        coinbase
      }
    ]
    const request = JSON.stringify(this.prepareRelayRequest('eth_callBundle', params))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    const callResult = response.result
    return {
      bundleGasPrice: BigNumber.from(callResult.bundleGasPrice),
      bundleHash: callResult.bundleHash,
      coinbaseDiff: BigNumber.from(callResult.coinbaseDiff),
      ethSentToCoinbase: BigNumber.from(callResult.ethSentToCoinbase),
      gasFees: BigNumber.from(callResult.gasFees),
      results: callResult.results,
      stateBlockNumber: callResult.stateBlockNumber,
      totalGasUsed: callResult.results.reduce((a: number, b: TransactionSimulation) => a + b.gasUsed, 0),
      firstRevert: callResult.results.find((txSim: TransactionSimulation) => 'revert' in txSim || 'error' in txSim)
    }
  }

  private calculateBundlePricing(
    bundleTransactions: Array<BlocksApiResponseTransactionDetails | TransactionSimulation>,
    baseFee: BigNumber
  ) {
    const bundleGasPricing = bundleTransactions.reduce(
      (acc, transactionDetail) => {
        // see: https://blocks.flashbots.net/ and https://github.com/flashbots/ethers-provider-flashbots-bundle/issues/62
        const gasUsed = 'gas_used' in transactionDetail ? transactionDetail.gas_used : transactionDetail.gasUsed
        const ethSentToCoinbase =
          'coinbase_transfer' in transactionDetail
            ? transactionDetail.coinbase_transfer
            : 'ethSentToCoinbase' in transactionDetail
            ? transactionDetail.ethSentToCoinbase
            : BigNumber.from(0)
        const totalMinerReward =
          'total_miner_reward' in transactionDetail
            ? BigNumber.from(transactionDetail.total_miner_reward)
            : 'coinbaseDiff' in transactionDetail
            ? BigNumber.from(transactionDetail.coinbaseDiff)
            : BigNumber.from(0)
        const priorityFeeReceivedByMiner = totalMinerReward.sub(ethSentToCoinbase)
        return {
          gasUsed: acc.gasUsed + gasUsed,
          gasFeesPaidBySearcher: acc.gasFeesPaidBySearcher.add(baseFee.mul(gasUsed).add(priorityFeeReceivedByMiner)),
          priorityFeesReceivedByMiner: acc.priorityFeesReceivedByMiner.add(priorityFeeReceivedByMiner),
          ethSentToCoinbase: acc.ethSentToCoinbase.add(ethSentToCoinbase)
        }
      },
      {
        gasUsed: 0,
        gasFeesPaidBySearcher: BigNumber.from(0),
        priorityFeesReceivedByMiner: BigNumber.from(0),
        ethSentToCoinbase: BigNumber.from(0)
      }
    )
    const effectiveGasPriceToSearcher =
      bundleGasPricing.gasUsed > 0
        ? bundleGasPricing.ethSentToCoinbase.add(bundleGasPricing.gasFeesPaidBySearcher).div(bundleGasPricing.gasUsed)
        : BigNumber.from(0)
    const effectivePriorityFeeToMiner =
      bundleGasPricing.gasUsed > 0
        ? bundleGasPricing.ethSentToCoinbase.add(bundleGasPricing.priorityFeesReceivedByMiner).div(bundleGasPricing.gasUsed)
        : BigNumber.from(0)
    return {
      ...bundleGasPricing,
      txCount: bundleTransactions.length,
      effectiveGasPriceToSearcher,
      effectivePriorityFeeToMiner
    }
  }

  /**
   * Gets information about a conflicting bundle. Useful if you're competing
   * for well-known MEV and want to know why your bundle didn't land.
   * @param targetSignedBundledTransactions signed bundle
   * @param targetBlockNumber block in which bundle should be included
   * @returns conflict and gas price details
   */
  public async getConflictingBundle(
    targetSignedBundledTransactions: Array<string>,
    targetBlockNumber: number
  ): Promise<FlashbotsBundleConflictWithGasPricing> {
    const baseFee = (await this.genericProvider.getBlock(targetBlockNumber)).baseFeePerGas || BigNumber.from(0)
    const conflictDetails = await this.getConflictingBundleWithoutGasPricing(targetSignedBundledTransactions, targetBlockNumber)
    return {
      ...conflictDetails,
      targetBundleGasPricing: this.calculateBundlePricing(conflictDetails.initialSimulation.results, baseFee),
      conflictingBundleGasPricing:
        conflictDetails.conflictingBundle.length > 0 ? this.calculateBundlePricing(conflictDetails.conflictingBundle, baseFee) : undefined
    }
  }

  /**
   * Gets information about a conflicting bundle. Useful if you're competing
   * for well-known MEV and want to know why your bundle didn't land.
   * @param targetSignedBundledTransactions signed bundle
   * @param targetBlockNumber block in which bundle should be included
   * @returns conflict details
   */
  public async getConflictingBundleWithoutGasPricing(
    targetSignedBundledTransactions: Array<string>,
    targetBlockNumber: number
  ): Promise<FlashbotsBundleConflict> {
    const [initialSimulation, competingBundles] = await Promise.all([
      this.simulate(targetSignedBundledTransactions, targetBlockNumber, targetBlockNumber - 1),
      this.fetchBlocksApi(targetBlockNumber)
    ])
    if (competingBundles.latest_block_number <= targetBlockNumber) {
      throw new Error('Blocks-api has not processed target block')
    }
    if ('error' in initialSimulation || initialSimulation.firstRevert !== undefined) {
      throw new Error('Target bundle errors at top of block')
    }
    const blockDetails = competingBundles.blocks[0]
    if (blockDetails === undefined) {
      return {
        initialSimulation,
        conflictType: FlashbotsBundleConflictType.NoBundlesInBlock,
        conflictingBundle: []
      }
    }
    const bundleTransactions = blockDetails.transactions
    const bundleCount = bundleTransactions[bundleTransactions.length - 1].bundle_index + 1
    const signedPriorBundleTransactions = []
    for (let currentBundleId = 0; currentBundleId < bundleCount; currentBundleId++) {
      const currentBundleTransactions = bundleTransactions.filter((bundleTransaction) => bundleTransaction.bundle_index === currentBundleId)
      const currentBundleSignedTxs = await Promise.all(
        currentBundleTransactions.map(async (competitorBundleBlocksApiTx) => {
          const tx = await this.genericProvider.getTransaction(competitorBundleBlocksApiTx.transaction_hash)
          if (tx.raw !== undefined) {
            return tx.raw
          }
          if (tx.v !== undefined && tx.r !== undefined && tx.s !== undefined) {
            if (tx.type === 2) {
              delete tx.gasPrice
            }
            return serialize(tx, {
              v: tx.v,
              r: tx.r,
              s: tx.s
            })
          }
          throw new Error('Could not get raw tx')
        })
      )
      signedPriorBundleTransactions.push(...currentBundleSignedTxs)
      const competitorAndTargetBundleSimulation = await this.simulate(
        [...signedPriorBundleTransactions, ...targetSignedBundledTransactions],
        targetBlockNumber,
        targetBlockNumber - 1
      )

      if ('error' in competitorAndTargetBundleSimulation) {
        if (competitorAndTargetBundleSimulation.error.message.startsWith('err: nonce too low:')) {
          return {
            conflictType: FlashbotsBundleConflictType.NonceCollision,
            initialSimulation,
            conflictingBundle: currentBundleTransactions
          }
        }
        throw new Error('Simulation error')
      }
      const targetSimulation = competitorAndTargetBundleSimulation.results.slice(-targetSignedBundledTransactions.length)
      for (let j = 0; j < targetSimulation.length; j++) {
        const targetSimulationTx = targetSimulation[j]
        const initialSimulationTx = initialSimulation.results[j]
        if ('error' in targetSimulationTx || 'error' in initialSimulationTx) {
          if ('error' in targetSimulationTx != 'error' in initialSimulationTx) {
            return {
              conflictType: FlashbotsBundleConflictType.Error,
              initialSimulation,
              conflictingBundle: currentBundleTransactions
            }
          }
          continue
        }
        if (targetSimulationTx.ethSentToCoinbase != initialSimulationTx.ethSentToCoinbase) {
          return {
            conflictType: FlashbotsBundleConflictType.CoinbasePayment,
            initialSimulation,
            conflictingBundle: currentBundleTransactions
          }
        }
        if (targetSimulationTx.gasUsed != initialSimulation.results[j].gasUsed) {
          return {
            conflictType: FlashbotsBundleConflictType.GasUsed,
            initialSimulation,
            conflictingBundle: currentBundleTransactions
          }
        }
      }
    }
    return {
      conflictType: FlashbotsBundleConflictType.NoConflict,
      initialSimulation,
      conflictingBundle: []
    }
  }

  /** Gets information about a block from Flashbots blocks API. */
  public async fetchBlocksApi(blockNumber: number): Promise<BlocksApiResponse> {
    return fetchJson(`https://blocks.flashbots.net/v1/blocks?block_number=${blockNumber}`)
  }

  private async request(request: string) {
    const connectionInfo = { ...this.connectionInfo }
    connectionInfo.headers = {
      'X-Flashbots-Signature': `${await this.authSigner.getAddress()}:${await this.authSigner.signMessage(id(request))}`,
      ...this.connectionInfo.headers
    }
    return fetchJson(connectionInfo, request)
  }

  private async fetchReceipts(bundledTransactions: Array<TransactionAccountNonce>): Promise<Array<TransactionReceipt>> {
    return Promise.all(bundledTransactions.map((bundledTransaction) => this.genericProvider.getTransactionReceipt(bundledTransaction.hash)))
  }

  private prepareRelayRequest(
    method:
      | 'eth_callBundle'
      | 'eth_cancelBundle'
      | 'eth_sendBundle'
      | 'eth_sendPrivateTransaction'
      | 'eth_cancelPrivateTransaction'
      | 'flashbots_getUserStats'
      | 'flashbots_getBundleStats'
      | 'flashbots_getUserStatsV2'
      | 'flashbots_getBundleStatsV2',
    params: RpcParams
  ) {
    return {
      method: method,
      params: params,
      id: this._nextId++,
      jsonrpc: '2.0'
    }
  }
}

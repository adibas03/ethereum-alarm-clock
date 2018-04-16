require("chai")
  .use(require("chai-as-promised"))
  .should()

const { expect } = require("chai")

// Contracts
const RequestFactory = artifacts.require("./RequestFactory.sol")
const RequestLib = artifacts.require("./RequestLib.sol")
const TransactionRequestCore = artifacts.require("./TransactionRequestCore.sol")

// Brings in config.web3 (v1.0.0)
const config = require("../../config")
const ethUtil = require("ethereumjs-util")
const { parseRequestData, calculateBlockBucket } = require("../dataHelpers.js")

const NULL_ADDR = "0x0000000000000000000000000000000000000000"

// Note - these tests were checked very well and should never be wrong.
// If they start failing - look in the contracts.
contract("Request factory", async (accounts) => {
  it("should create a request with provided properties", async () => {
    // Get the instance of the deployed RequestLib
    const requestLib = await RequestLib.deployed()
    expect(requestLib.address).to.exist

    // Get the current block
    const curBlock = await config.web3.eth.getBlockNumber()

    // Set up the data for our transaction request
    const claimWindowSize = 255
    const fee = 12345
    const bounty = 54321
    const freezePeriod = 10
    const windowStart = curBlock + 20
    const windowSize = 511
    const reservedWindowSize = 16
    const temporalUnit = 1
    const callValue = 123456789
    const callGas = 1000000
    const gasPrice = 1000000
    const requiredDeposit = 1000000
    const testCallData = "this-is-call-data"

    // Validate the data with the RequestLib
    const isValid = await requestLib.validate(
      [accounts[0], accounts[0], accounts[1], accounts[2]],
      [
        fee,
        bounty,
        claimWindowSize,
        freezePeriod,
        reservedWindowSize,
        temporalUnit,
        windowSize,
        windowStart,
        callGas,
        callValue,
      ],
      "this-is-call-data",
      config.web3.utils.toWei("10") // endowment calculate actual endowment
    )

    isValid.forEach(bool => expect(bool).to.be.true)

    // We need a transaction request core for the factory
    const transactionRequestCore = await TransactionRequestCore.deployed()
    expect(transactionRequestCore.address).to.exist

    // Pass the request tracker to the factory
    const requestFactory = await RequestFactory.new(transactionRequestCore.address)
    expect(requestFactory.address).to.exist

    const params = [
      fee,
      bounty,
      claimWindowSize,
      freezePeriod,
      reservedWindowSize,
      temporalUnit,
      windowSize,
      windowStart,
      callGas,
      callValue,
      gasPrice,
      requiredDeposit
    ]

    // Create a request with the same args we validated
    const createTx = await requestFactory.createRequest(
      [
        accounts[0],
        accounts[1], // fee recipient
        accounts[2], // to
      ],
      params,
      testCallData
    )
    expect(createTx.receipt).to.exist

    const logRequestCreated = createTx.logs.find(e => e.event === "RequestCreated")

    expect(logRequestCreated.args.request).to.exist
    expect(logRequestCreated.args.params.length).to.equal(12)
    logRequestCreated.args.params.forEach((el, idx) => expect(el.toNumber()).to.equal(params[idx]))

    const bucket = calculateBlockBucket(windowStart)
    expect(logRequestCreated.args.bucket.toNumber()).to.equal(bucket.toNumber())

    // Now let's create a transactionRequest instance
    const txRequest = await TransactionRequestCore.at(logRequestCreated.args.request)
    const requestData = await parseRequestData(txRequest)

    expect(requestData.meta.owner).to.equal(accounts[0])

    expect(requestData.meta.createdBy).to.equal(accounts[0])

    expect(requestData.meta.isCancelled).to.be.false

    expect(requestData.meta.wasCalled).to.be.false

    expect(requestData.meta.wasSuccessful).to.be.false

    expect(requestData.claimData.claimedBy).to.equal(NULL_ADDR)

    expect(requestData.claimData.claimDeposit).to.equal(0)

    expect(requestData.claimData.paymentModifier).to.equal(0)

    expect(requestData.paymentData.fee).to.equal(fee)

    expect(requestData.paymentData.feeRecipient).to.equal(accounts[1])

    expect(requestData.paymentData.feeOwed).to.equal(0)

    expect(requestData.paymentData.bounty).to.equal(bounty)

    expect(requestData.paymentData.bountyBenefactor).to.equal(NULL_ADDR)

    expect(requestData.paymentData.bountyOwed).to.equal(0)

    expect(requestData.schedule.claimWindowSize).to.equal(claimWindowSize)

    expect(requestData.schedule.freezePeriod).to.equal(freezePeriod)

    expect(requestData.schedule.windowStart).to.equal(windowStart)

    expect(requestData.schedule.reservedWindowSize).to.equal(reservedWindowSize)

    expect(requestData.schedule.temporalUnit).to.equal(1)

    expect(requestData.txData.toAddress).to.equal(accounts[2])

    expect(await txRequest.callData()).to.equal(ethUtil.bufferToHex(Buffer.from(testCallData)))

    expect(requestData.txData.callValue).to.equal(callValue)

    expect(requestData.txData.callGas).to.equal(callGas)

    // Lastly, we just make sure that the transaction request
    // address is a known request for the factory.
    expect(await requestFactory.isKnownRequest(NULL_ADDR)).to.be.false // sanity check

    expect(await requestFactory.isKnownRequest(txRequest.address)).to.be.true
  })

  it("should test request factory insufficient endowment validation error", async () => {
    const curBlock = await config.web3.eth.getBlockNumber()

    const requestLib = await RequestLib.deployed()
    expect(requestLib.address).to.exist

    const claimWindowSize = 255
    const fee = 12345
    const bounty = 54321
    const freezePeriod = 10
    const windowStart = curBlock + 20
    const windowSize = 255
    const reservedWindowSize = 16
    const temporalUnit = 1
    const callValue = 123456789
    const callGas = 1000000

    // Validate the data with the RequestLib
    const isValid = await requestLib.validate(
      [accounts[0], accounts[0], accounts[1], accounts[2]],
      [
        fee,
        bounty,
        claimWindowSize,
        freezePeriod,
        reservedWindowSize,
        temporalUnit,
        windowSize,
        windowStart,
        callGas,
        callValue,
      ],
      "this-is-call-data",
      1 // endowment ATTENTION THIS IS TOO SMALL, HENCE WHY IT FAILS
    )

    expect(isValid[0]).to.be.false

    isValid.slice(1).forEach(bool => expect(bool).to.be.true)
  })

  it("should test request factory throws validation error on too large of a reserve window", async () => {
    const curBlock = await config.web3.eth.getBlockNumber()

    const requestLib = await RequestLib.deployed()
    expect(requestLib.address).to.exist

    const claimWindowSize = 255
    const fee = 12345
    const bounty = 54321
    const freezePeriod = 10
    const windowStart = curBlock + 20
    const windowSize = 255
    const reservedWindowSize = 255 + 2 // 2 more than window size
    const temporalUnit = 1
    const callValue = 123456789
    const callGas = 1000000

    // Validate the data with the RequestLib
    const isValid = await requestLib.validate(
      [accounts[0], accounts[0], accounts[1], accounts[2]],
      [
        fee,
        bounty,
        claimWindowSize,
        freezePeriod,
        reservedWindowSize,
        temporalUnit,
        windowSize,
        windowStart,
        callGas,
        callValue,
      ],
      "this-is-call-data",
      config.web3.utils.toWei("10") // endowment
    )

    expect(isValid[1]).to.be.false

    expect(isValid[0]).to.be.true

    isValid.slice(2).forEach(bool => expect(bool).to.be.true)
  })

  it("should test request factory throws invalid temporal unit validation error", async () => {
    const curBlock = await config.web3.eth.getBlockNumber()

    const requestLib = await RequestLib.deployed()
    expect(requestLib.address).to.exist

    const claimWindowSize = 255
    const fee = 12345
    const bounty = 54321
    const freezePeriod = 10
    const windowStart = curBlock + 20
    const windowSize = 255
    const reservedWindowSize = 16
    const temporalUnit = 3 // Only 1 and 2 are supported
    const callValue = 123456789
    const callGas = 1000000

    // Validate the data with the RequestLib
    const isValid = await requestLib.validate(
      [accounts[0], accounts[0], accounts[1], accounts[2]],
      [
        fee,
        bounty,
        claimWindowSize,
        freezePeriod,
        reservedWindowSize,
        temporalUnit,
        windowSize,
        windowStart,
        callGas,
        callValue,
      ],
      "this-is-call-data",
      config.web3.utils.toWei("10") // endowment
    )

    expect(isValid[2]).to.be.false

    expect(isValid[3]).to.be.false

    isValid.slice(0, 2).forEach(bool => expect(bool).to.be.true)
    isValid.slice(4).forEach(bool => expect(bool).to.be.true)
  })

  it("should test request factory too soon execution window validation error", async () => {
    const curBlock = await config.web3.eth.getBlockNumber()

    const requestLib = await RequestLib.deployed()
    expect(requestLib.address).to.exist

    const claimWindowSize = 255
    const fee = 12345
    const bounty = 54321
    const freezePeriod = 11 // more than the blocks between now and the window start
    const windowStart = curBlock + 10
    const windowSize = 255
    const reservedWindowSize = 16
    const temporalUnit = 1
    const callValue = 123456789
    const callGas = 1000000

    // Validate the data with the RequestLib
    const isValid = await requestLib.validate(
      [accounts[0], accounts[0], accounts[1], accounts[2]],
      [
        fee,
        bounty,
        claimWindowSize,
        freezePeriod,
        reservedWindowSize,
        temporalUnit,
        windowSize,
        windowStart,
        callGas,
        callValue,
      ],
      "this-is-call-data",
      config.web3.utils.toWei("10") // endowment
    )

    expect(isValid[3]).to.be.false

    isValid.slice(0, 3).forEach(bool => expect(bool).to.be.true)
    isValid.slice(4).forEach(bool => expect(bool).to.be.true)
  })

  it("should test request factory has too high call gas validation error", async () => {
    const curBlock = await config.web3.eth.getBlockNumber()

    const requestLib = await RequestLib.deployed()
    expect(requestLib.address).to.exist

    const claimWindowSize = 255
    const fee = 12345
    const bounty = 54321
    const freezePeriod = 10
    const windowStart = curBlock + 20
    const windowSize = 255
    const reservedWindowSize = 16
    const temporalUnit = 1
    const callValue = 123456789
    const callGas = 8.8e8 // cannot be over gas limit

    // Validate the data with the RequestLib
    const isValid = await requestLib.validate(
      [accounts[0], accounts[0], accounts[1], accounts[2]],
      [
        fee,
        bounty,
        claimWindowSize,
        freezePeriod,
        reservedWindowSize,
        temporalUnit,
        windowSize,
        windowStart,
        callGas,
        callValue,
      ],
      "this-is-call-data",
      config.web3.utils.toWei("10") // endowment
    )

    expect(isValid[4]).to.be.false

    isValid.slice(0, 4).forEach(bool => expect(bool).to.be.true)
    isValid.slice(5).forEach(bool => expect(bool).to.be.true)
  })

  it("should test null to address validation error", async () => {
    const curBlock = await config.web3.eth.getBlockNumber()

    const requestLib = await RequestLib.deployed()
    expect(requestLib.address).to.exist

    const claimWindowSize = 255
    const fee = 12345
    const bounty = 54321
    const freezePeriod = 10
    const windowStart = curBlock + 20
    const windowSize = 255
    const reservedWindowSize = 16
    const temporalUnit = 1
    const callValue = 123456789
    const callGas = 1000000

    // Validate the data with the RequestLib
    const isValid = await requestLib.validate(
      [
        accounts[0],
        accounts[0],
        accounts[1],
        NULL_ADDR, // TO ADDRESS
      ],
      [
        fee,
        bounty,
        claimWindowSize,
        freezePeriod,
        reservedWindowSize,
        temporalUnit,
        windowSize,
        windowStart,
        callGas,
        callValue,
      ],
      "this-is-call-data",
      config.web3.utils.toWei("10") // endowment
    )

    expect(isValid[5]).to.be.false

    isValid.slice(0, 5).forEach(bool => expect(bool).to.be.true)
  })
})

const Wallet = require("../../models/walletSchema");
const User = require("../../models/userSchema");
const Razorpay =require('razorpay');
const crypto = require("crypto");

const loadWallet = async(req,res)=>{
try {

   const userId = req.session.user

   const user = await User.findById(userId);

   let wallet = await Wallet.findOne({ userId })
    
    if (!wallet) {
      wallet = await Wallet.create({
        userId,
        balance: 0,
        transactions: []
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5; 
    const skip = (page - 1) * limit;


    wallet.transactions.sort(
      (a, b) => b.createdAt - a.createdAt
    );

    const totalTransactions = wallet.transactions.length;
    const paginatedTransactions = wallet.transactions.slice(skip, skip + limit);

    const totalPages = Math.ceil(totalTransactions / limit);
    
    res.render("wallet",{
        wallet,
       transactions: paginatedTransactions,
        user,
        page,
      totalPages,
      limit,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      totalTransactions
    })
} catch (error) {
    console.log(error)
}
}


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const createWalletOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.session.user;

    if (!amount || amount < 1) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const options = {
      amount: amount * 100, 
      currency: "INR",
      receipt: "wallet_" + Date.now()
    };

    const order = await razorpay.orders.create(options);

    return res.json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error("Create Wallet Order Error:", error);
    res.status(500).json({ success: false, message: "Unable to create order" });
  }
};


const verifyWalletPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount
    } = req.body;

    const userId = req.session.user;

  
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expectedSign !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

   
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({ userId });
    }

    wallet.balance += Number(amount);
    wallet.transactions.unshift({
      amount,
      type: "credit",
      reason:'Wallet Topup',
      description: "Wallet top-up via Razorpay"
    });

    await wallet.save();

    return res.json({
      success: true,
      message: "Wallet credited successfully"
    });

  } catch (error) {
    console.error("Verify Wallet Payment Error:", error);
    res.status(500).json({ success: false, message: "Payment failed" });
  }
};

module.exports ={
    loadWallet,
    createWalletOrder,
    verifyWalletPayment
}
const User = require("../../models/userSchema");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const env = require("dotenv").config();
const Category = require("../../models/categorySchema");
const Products = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");
const Wallet = require("../../models/walletSchema")
const applyBestDiscount = require('../../helper/applyBestDiscount')
const CategoryOffer = require('../../models/categoryOffer')

const pageNotFound = async (req, res) => {
  try {
    res.status(404).render("user/page-404");
  } catch (error) {
    console.error("404 Page Error:", error);
    res.status(500).send("Internal Server Error");
  }
};

const loadSignup = async (req, res) => {
  try {
    if (req.session && req.session.userId) {
      return res.redirect("/");
    }

    return res.render("signup", {
      error: null,
      oldInput: { fullname: "", email: "" },
    });
  } catch (error) {
    console.error("Signup Page Load Error:", error);
    res.status(500).render("error", {
      message: "Unable to load signup page",
    });
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify your account",
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP:${otp}</b>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending email", error);
    return false;
  }
}

const generateUniqueReferralId = async () => {
  let referralId;
  let exists = true;

  while (exists) {
    referralId = Math.random().toString(36).substring(2, 8).toUpperCase();
    exists = await User.findOne({ referralId });
  }

  return referralId;
};

// Load OTP page - prevents OTP regeneration on refresh
const loadOtpPage = async (req, res) => {
  try {
    // Check if user has valid session data
    if (!req.session.userData || !req.session.userOtp) {
      return res.redirect("/signup");
    }

    const email = req.session.userData.email;
    return res.render("otp_page", { email });
  } catch (error) {
    console.error("OTP Page Load Error:", error);
    res.redirect("/signup");
  }
};


const signUp = async (req, res) => {
  try {
    const { fullname, email, password, confirm_password, referral_code: referralId } = req.body;


    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render("signup", {
        message: "User with this email already exists",
        oldInput: { fullname, email }
      });
    }

    let referredUser = null;
    let referredUserId = null;

    if (referralId && referralId.trim()) {
      referredUser = await User.findOne({ referralId: referralId.trim() });

      if (!referredUser) {
        return res.render("signup", {
          message: "Invalid referral code",
          oldInput: { fullname, email }
        });
      }

      if (referredUser.email === email) {
        return res.render("signup", {
          message: "You cannot use your own referral code",
          oldInput: { fullname, email }
        });
      }

      referredUserId = referredUser._id;
    }


    if (password) {
      if (password !== confirm_password) {
        return res.render("signup", { message: "Passwords do not match" });
      }

      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);

      if (!emailSent) {
        return res.json({ success: false, message: "Failed to send OTP email" });
      }

      console.log("OTP:", otp);


      req.session.userData = {
        fullname,
        email,
        password,
        referralId: referralId?.trim() || null,
        referredUserId
      };
      req.session.userOtp = otp;
      req.session.otpTimestamp = Date.now(); // Store OTP creation time

      return res.redirect("/otp-page");
    }


    const newReferralId = await generateUniqueReferralId();

    const newUser = new User({
      fullname,
      email,
      referralId: newReferralId,
      referredBy: referredUser ? referredUser.referralId : null
    });

    await newUser.save();

    // Credit bonuses immediately for Google signup
    await creditReferralBonuses(newUser._id, referredUserId);

    req.session.user = newUser._id;
    res.locals.user = true;

    return res.json({ success: true, redirectUrl: "/" });

  } catch (error) {
    console.error("Signup error:", error);
    res.redirect("/PageNotFound");
  }
};


const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {
    console.error(error);
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    // Check if OTP has expired (3 minutes = 180000 milliseconds)
    const OTP_EXPIRY_TIME = 3 * 60 * 1000; // 3 minutes in milliseconds
    const currentTime = Date.now();
    const otpAge = currentTime - (req.session.otpTimestamp || 0);

    if (!req.session.otpTimestamp || otpAge > OTP_EXPIRY_TIME) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one."
      });
    }

    if (otp !== req.session.userOtp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP, please try again"
      });
    }

    const userData = req.session.userData;
    if (!userData) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please sign up again."
      });
    }

    let passwordHash = null;
    if (userData.password) {
      passwordHash = await securePassword(userData.password);
    }

    const referralId = await generateUniqueReferralId();


    const newUser = new User({
      fullname: userData.fullname,
      email: userData.email,
      password: passwordHash,
      referralId: referralId,
      referredBy: userData.referralId || null
    });

    await newUser.save();


    await creditReferralBonuses(newUser._id, userData.referredUserId || null);

    delete req.session.userOtp;
    delete req.session.otpTimestamp;
    delete req.session.userData;

    req.session.user = newUser._id;
    res.locals.user = true;

    res.json({ success: true, redirectUrl: "/" });

  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};

async function creditReferralBonuses(newUserId, referredByUserId = null) {
  const signupBonus = referredByUserId ? 50 : 0;


  const existingWallet = await Wallet.findOne({ userId: newUserId });

  if (!existingWallet) {

    const newUserTransactions = signupBonus ? [{
      amount: signupBonus,
      type: "credit",
      reason: "Referral Bonus",
      description: "Bonus for signing up with a referral code"
    }] : [];

    await Wallet.create({
      userId: newUserId,
      balance: signupBonus,
      transactions: newUserTransactions
    });
  } else {

    if (signupBonus > 0) {
      await Wallet.updateOne(
        { userId: newUserId },
        {
          $inc: { balance: signupBonus },
          $push: {
            transactions: {
              amount: signupBonus,
              type: "credit",
              reason: "Referral Bonus",
              description: "Bonus for signing up with a referral code"
            }
          }
        }
      );
    }
  }


  if (referredByUserId) {
    const referrer = await User.findById(referredByUserId);
    if (!referrer) return;


    const alreadyReferred = referrer.referredUsers?.some(
      (ref) => ref.userId.toString() === newUserId.toString()
    );

    if (alreadyReferred) return;

    await Wallet.updateOne(
      { userId: referredByUserId },
      {
        $inc: { balance: 100 },
        $push: {
          transactions: {
            amount: 100,
            type: "credit",
            reason: "Referral Reward",
            description: "Reward for successful referral"
          }
        }
      }
    );


    await User.findByIdAndUpdate(referredByUserId, {
      $push: { referredUsers: { userId: newUserId } }
    });
  }
}


const resendOtp = async (req, res) => {
  try {
    let email;

    // 1. Signup flow (most common case in your current code)
    if (req.session.userData && req.session.userData.email) {
      email = req.session.userData.email;
    }
    // 2. Forgot password / reset password flow
    else if (req.session.resetEmail) {
      email = req.session.resetEmail;
    }
    // 3. Neither → session expired or invalid request
    else {
      return res.status(400).json({
        success: false,
        message: "Session expired or no email found. Please try again.",
      });
    }

    // Optional: extra safety - check if user exists (especially useful for reset flow)
    const userExists = await User.findOne({ email });
    if (!userExists && req.session.resetEmail) {
      // In reset flow we already checked existence earlier → but belt & suspenders
      delete req.session.resetEmail;
      delete req.session.userOtp;
      delete req.session.otpTimestamp;
      return res.status(400).json({
        success: false,
        message: "No account found with this email.",
      });
    }

    const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpTimestamp = Date.now(); // reset expiration timer

    const emailSent = await sendVerificationEmail(email, otp);

    if (emailSent) {
      console.log(`Resent OTP to ${email}: ${otp}`);
      return res.status(200).json({
        success: true,
        message: "OTP Resent Successfully",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to resend OTP. Please try again.",
      });
    }
  } catch (error) {
    console.error("Error resending OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};


const loadHomepage = async (req, res) => {
  try {

    let products = await Products.find({ isDeleted: false });
    const categories = await Category.find({ isListed: true });


    const now = new Date();
    const categoryOffers = await CategoryOffer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).lean();

    const categoryOfferMap = {};
    categoryOffers.forEach(offer => {
      categoryOfferMap[offer.categoryId.toString()] =
        offer.discountPercentage;
    });


    let cartItems = [];
    let wishlistItems = [];

    if (req.session.user) {
      const cart = await Cart.findOne({
        userId: req.session.user
      }).lean();

      cartItems = cart
        ? cart.items.map(i => i.productId.toString())
        : [];

      const wishlist = await Wishlist.findOne({
        userId: req.session.user
      }).lean();

      wishlistItems = wishlist
        ? wishlist.items.map(i => i.productId.toString())
        : [];
    }


    products = applyBestDiscount({
      products,
      categoryOfferMap,
      cartItems,
      wishlistItems
    });


    const newArrivals = [...products]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 3);

    const trendingProducts = [...products]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);

    const specialOffers = [...products]
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 3);


    return res.render("home", {
      newArrivals,
      trendingProducts,
      specialOffers,
      categories,
      isLoggedIn: !!req.session.user
    });

  } catch (error) {
    console.error("Homepage Load Error:", error);
    res.status(500).render("error", {
      message: "Unable to load homepage"
    });
  }
};


const emailverification = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.render("forgotemailpage", {
        message: "No account found with this email address.",
      });
    }
    const otp = generateOtp();
    console.log(otp)
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.render("forgotemailpage", { message: "Failed to send email" });
    }
    req.session.userOtp = otp;
    req.session.otpTimestamp = Date.now(); // Store OTP creation time for password reset
    req.session.resetEmail = email; // Store email for password reset

    res.redirect("/reset-password");


  } catch (error) {
    console.error("error");
    res.render("forgotemailpage", {
      message: "Something went wrong. Please try again later.",
    })
  }
};

const loadLogin = async (req, res) => {
  try {
    res.render("signin");
  } catch (error) {
    console.log("Error occured while login page rendering");
  }
};

const loadresetpassword = async (req, res) => {
  try {
    // Check if user has valid session data for password reset
    if (!req.session.userOtp || !req.session.resetEmail) {
      return res.redirect("/forgot-password");
    }

    const email = req.session.resetEmail;
    res.render("passwordrecovery", { email });
  } catch (error) {
    console.log("Error occured while forgot password recovery email page");
    res.redirect("/forgot-password");
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).render("signin", {
        error: "Please provide email and password",
        oldInput: { email },
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
    });


    if (!user) {
      return res.status(401).render("signin", {
        error: "Invalid email or password",
        oldInput: { email },
      });
    }

    if (!user.password) {
      console.log("inside passwprd checking");
      return res.render("signin", {
        error: "created a new password using forgot password",
      });
    }

    if (user.isBlocked) {
      return res.status(401).render("signin", {
        error: "User Blocked, Please Contact Admin",
      });
    }
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).render("signin", {
        error: "Invalid email or password",
        oldInput: { email },
      });
    }
    req.session.user = user._id;
    res.locals.user = true;

    return res.redirect("/");
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).render("error", {
      message: "An error occurred during login",
    });
  }
};


const resetpasswordverification = async (req, res) => {
  try {
    const { newPassword, otp, userEmail } = req.body;

    // Check if OTP has expired (3 minutes = 180000 milliseconds)
    const OTP_EXPIRY_TIME = 3 * 60 * 1000; // 3 minutes in milliseconds
    const currentTime = Date.now();
    const otpAge = currentTime - (req.session.otpTimestamp || 0);

    if (!req.session.otpTimestamp || otpAge > OTP_EXPIRY_TIME) {
      return res.status(401).json({
        success: false,
        message: "OTP has expired. Please request a new one."
      });
    }

    if (req.session.userOtp !== otp) {
      return res.status(401).json({ success: false, message: "Invalid Otp" });
    }

    const user = await User.findOne({ email: userEmail });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const passwordHash = await securePassword(newPassword);
    user.password = passwordHash;
    await user.save({ validateBeforeSave: false });

    // Clean up session data
    delete req.session.userOtp;
    delete req.session.otpTimestamp;
    delete req.session.resetEmail;

    return res
      .status(200)
      .json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    // Optional: send real error to client in development only
    return res.status(500).json({
      success: false,
      message: "Server error while resetting password",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout Error:", err);
      return res.status(500).send("Could not log out");
    }
    res.locals.user = false;
    res.redirect("/login");
  });
};

const forgotpassword = async (req, res) => {
  try {

    res.render("forgotemailpage");
  } catch (error) {
    console.log("Error occured while forgot password recovery email page");
  }
};

const loaduserprofile = async (req, res) => {
  try {
    const userId = req.session.user;

    const user = await User.findById(userId)
      .populate("referredUsers.userId", "fullname email")
      .lean();

    if (!user) return res.redirect("/login");

    const wallet = await Wallet.findOne({ userId }).lean();

    const addresses = user.address || [];

    const defaultAddress = addresses.find((a) => a.isDefault);

    res.render("userprofile", {
      user,
      wallet,
      referralCode: user.referralId,
      referredCount: user.referredUsers?.length || 0,
      addresses,
      defaultAddress,
    });
  } catch (error) {
    console.log("Error occured while rendering userprofile page", error);
    res.redirect("/pageNotFound");
  }
};

const loadaddressmanagement = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.redirect("/login");
    }

    const addressList = Array.isArray(user.address) ? user.address : [];

    const defaultAddress = addressList.find((a) => a.isDefault) || null;

    res.render("addressmanagement", {
      user,
      addressList,
      defaultAddress,
    });
  } catch (error) {
    console.log("Error occured while rendering addressmanagement page", error);
    res.redirect("/pageNotFound");
  }
};

const loadChangePassword = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId);

    if (!user) {
      return res.redirect("/pageNotFound");
    }

    res.render("changepassword2", {
      user,
      error: null,
      success: null,
      activePage: "change-password",
    });
  } catch (error) {
    console.log("Load Change page Error :", error);
    res.redirect("/pageNotFound");
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.session.user;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    const user = await User.findById(userId).select('+password');

    if (!user) {
      return res.redirect("/pageNotFound");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.render("changepassword2", {
        error: "Current password is incorrect!",
        success: null,
        activePage: "change-password",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.render("changepassword2", {
        error: "New password and confirmation do not match!",
        success: null,
        activePage: "change-password"
      });
    }

    const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (isSameAsCurrent) {
      return res.render("changepassword2", {
        error: "New password must be different from current password!",
        success: null,
        activePage: "change-password",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, { password: hashedPassword });

    return res.render("changepassword2", {
      error: null,
      success: "Password updated successfully!",
      activePage: "change-password",
    });
  } catch (error) {
    console.log("Change Password Error : ", error);
    res.redirect("/pageNotFound");
  }
};

const updateUserName = async (req, res) => {
  try {
    const { fullname } = req.body;

    if (!fullname || fullname.length < 3) {
      return res.json({ success: false, message: "Invalid name" });
    }

    await User.findByIdAndUpdate(req.session.user, { fullname });

    return res.json({ success: true });
  } catch (error) {
    console.log("Error updating username:", error);
    return res.json({ succes: false, message: "Server error" });
  }
};


const loadAboutpage = async (req, res) => {
  try {

    res.render('aboutPage', {
      user: req.session.user || null
    })
  } catch (error) {
    console.log(error)
  }
}

module.exports = {
  loadHomepage,
  pageNotFound,
  loadSignup,
  signUp,
  loadLogin,
  login,
  logout,
  verifyOtp,
  resendOtp,
  loadOtpPage,



  loaduserprofile,
  loadaddressmanagement,
  loadChangePassword,
  changePassword,
  updateUserName,
  loadAboutpage,
  forgotpassword,
  resetpasswordverification,
  loadresetpassword,
  emailverification,
};

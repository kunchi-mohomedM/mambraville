const User = require("../../models/userSchema");
const bcrypt = require("bcryptjs");
const validator = require("validator");
const nodemailer = require("nodemailer");
const env = require("dotenv").config();
const Category = require("../../models/categorySchema");
const Products = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");
const Wallet = require("../../models/walletSchema")
const applyBestDiscount = require('../../helper/applyBestDiscount')
const CategoryOffer= require('../../models/categoryOffer')

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

const signUp = async (req, res) => {
  try {
    console.log(req.body);

    const { fullname, email, password, confirm_password } = req.body;

    let googleSignIn = !password;
    console.log(password, googleSignIn);

    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render("signup", {
        message: "User with this email already exists",
      });
    }

    if (googleSignIn) {
      const newUser = new User({
        fullname,
        email,
        googleUser: true,
      });
      await newUser.save();
    
      

      await Wallet.create({
        userId: newUser._id,
        balance: 0,
        transactions: []
      });

      req.session.user = newUser._id;
      res.locals.user = true;
      return res.json({ success: true, redirectUrl: "/" });
    }

    if (password !== confirm_password) {
      return res.render("signup", { message: "Passwords do not match" });
    }

    const otp = generateOtp();
    console.log(otp);
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.json("email-error");
    }

    req.session.userOtp = otp;
    req.session.userData = { fullname, email, password };
    res.render("otp_page", { email });
    console.log("OTP Sent ", otp);
  } catch (error) {
    console.error("Signup error", error);
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
    console.log(otp);

    if (otp === req.session.userOtp) {
      const user = req.session.userData;

      let passwordHash = null;
      if (user.password) {
        passwordHash = await securePassword(user.password);
      }

      const saveUserData = new User({
        fullname: user.fullname,
        email: user.email,
        password: passwordHash,
        googleUser: passwordHash ? false : true,
      });

      await saveUserData.save();

        await Wallet.create({
        userId: saveUserData._id,
        balance: 0,
        transactions: []
      });
      req.session.user = saveUserData._id;
      res.locals.user = true;
      res.json({ success: true, redirectUrl: "/" });
    } else {
      res
        .status(400)
        .json({ success: false, message: "Invalid OTP, please try again" });
    }
  } catch (error) {
    console.error("Error verifying OTP", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email } = req.session.userData;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email not found in session" });
    }
    const otp = generateOtp();
    req.session.userOtp = otp;

    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      console.log("Resend OTP:", otp);
      res
        .status(200)
        .json({ success: true, message: "OTP Resend Successfully" });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to resend OTP.Please try again",
      });
    }
  } catch (error) {
    console.error("Error resending OTP", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error.Please try again",
    });
  }
};


const loadHomepage = async (req, res) => {
  try {
    
    let products = await Products.find({ isDeleted: false });
    const categories = await Category.find({ isListed: true });

    
    const categoryOffers = await CategoryOffer.find({
      isActive: true
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
        message: "User with this email is does not exists",
      });
    }
    const otp = generateOtp();

    const emailSent = await sendVerificationEmail(email, otp);
    console.log(otp);
    if (!emailSent) {
      return res.json("email-error");
    }
    req.session.userOtp = otp;

    res.render("passwordrecovery", { email });

    console.log(user);
  } catch (error) {
    console.error("error");
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
    res.render("passwordrecovery");
  } catch (error) {
    console.log("Error occured while forgot password recovery email page");
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
    //console.log(user)

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
    await user.save();
    return res
      .status(200)
      .json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.log("Error occured while reset password.");
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
    const user = await User.findById(userId).lean();

    if (!user) return res.redirect("/login");

    const addresses = user.address || [];

    const defaultAddress = addresses.find((a) => a.isDefault);

    res.render("userprofile", {
      user,
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

    res.render("changepassword2", {
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
    const { newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.render("changepassword2", {
        error: "Password do not match!",
        success: null,
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
  emailverification,
  loadresetpassword,
  forgotpassword,
  resetpasswordverification,
  loaduserprofile,
  loadaddressmanagement,
  loadChangePassword,
  changePassword,
  updateUserName,
};

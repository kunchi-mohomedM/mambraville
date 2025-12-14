const Category = require("../../models/categorySchema");
const Products = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");
const CategoryOffer = require("../../models/categoryOffer");

const loadUserProducts = async (req, res) => {
  try {
    let query = { isDeleted: false };

    // Pagination variables
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 15;
    let skip = (page - 1) * limit;

    let categoryDoc = null;

    if (req.query.category) {
      categoryDoc = await Category.findOne({
        categoryname: req.query.category,
      });
      if (categoryDoc) {
        query.category = categoryDoc._id;
      } else {
        query.category = null;
      }
    }

    // Filtering by price range
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) query.price.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) query.price.$lte = Number(req.query.maxPrice);
    }

    // Searching
    if (req.query.search) {
      query.productName = { $regex: req.query.search, $options: "i" }; // Case-insensitive search
    }

    // Sorting
    let sortOptions = {};
    switch (req.query.sort) {
      case "newest":
        sortOptions.createdAt = -1;
        break;
      case "oldest":
        sortOptions.createdAt = 1;
        break;
      case "priceasc":
        sortOptions.price = 1;
        break;
      case "pricedesc":
        sortOptions.price = -1;
        break;
      case "popular":
        sortOptions.ratings = -1;
        break;
      default:
        sortOptions.createdAt = -1;
    }

    const totalProducts = await Products.countDocuments(query);

    let products = await Products.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    const categoryOffers = await CategoryOffer.find({ isActive: true }).lean();

    const categoryOfferMap = {};
    categoryOffers.forEach((offer) => {
      categoryOfferMap[offer.categoryId.toString()] = offer.discountPercentage;
    });

    
    
    let cartItems = [];
    if (req.session.user) {
      const cart = await Cart.findOne({ userId: req.session.user });
      cartItems = cart ? cart.items.map((i) => i.productId.toString()) : [];
    }

    let wishlistItems = [];
    if (req.session.user) {
      const wishlist = await Wishlist.findOne({ userId: req.session.user });
      wishlistItems = wishlist
        ? wishlist.items.map((i) => i.productId.toString())
        : [];
    }

    products = products.map((p) => {
      const productDiscount = p.discount || 0;
      const categoryDiscount = categoryOfferMap[p.category?.toString()] || 0;

      const finalDiscountPercent = Math.max(productDiscount, categoryDiscount);

      const discountedPrice = Math.round(
        p.price - (p.price * finalDiscountPercent) / 100
      );

      return {
        ...p._doc,

        // cart & wishlist
        inCart: cartItems.includes(p._id.toString()),
        inWishlist: wishlistItems.includes(p._id.toString()),

        // pricing
        originalPrice: p.price,
        discountedPrice,
        discountPercent: finalDiscountPercent,
        discountSource:
          finalDiscountPercent === productDiscount ? "product" : "category",
      };
    });

    const categories = await Category.find({ isListed: true });

    res.render("products", {
      products,

      categoryDoc,

      categories,

      currentPage: page,

      totalPages: Math.ceil(totalProducts / limit),

      totalProducts,

      queryParams: req.query,

      searchQuery: req.query.search || "",

      isLoggedIn: !!req.session.user,

      message: req.query.message || null,
    });
  } catch (error) {
    console.error("Error occurred while rendering products page:", error);

    if (
      req.xhr ||
      req.headers["x-requested-with"] === "XMLHttpRequest" ||
      req.query.format === "json"
    ) {
      return res.status(500).json({
        status: "error",
        message: "An error occurred while loading products.",
      });
    }
    res.status(500).send("An error occurred while loading products..");
  }
};

const loadproductdetails = async (req, res) => {
  try {
    const productId = req.params.id;

    let product = await Products.findOne({ _id: productId, isDeleted: false });
    if (!product) {
      return res.redirect("/products-user");
    }

    let inCart = false;
    if (req.session.user) {
      const cart = await Cart.findOne({ userId: req.session.user });

      if (cart) {
        inCart = cart.items.some(
          (item) => item.productId.toString() === productId.toString()
        );
      }
    }

    product = { ...product._doc, inCart };

    const category = await Category.findById(product.category);
    const relatedProducts = await Products.find({
      category: product.category,
      isDeleted: false,
      _id: { $ne: product._id },
    })
      .sort({ createdAt: -1 })
      .limit(4);

    res.render("productdetails", { product, category, relatedProducts });
  } catch (error) {
    console.error("Error occued while rendering productdetails page", error);
  }
};

module.exports = {
  loadUserProducts,
  loadproductdetails,
};

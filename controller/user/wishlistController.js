const mongoose = require("mongoose")
const Wishlist = require("../../models/wishlistSchema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema")


const loadWishlist=async(req,res)=>{

    try {
        const userId = req.session.user;
        if(!userId) return res.redirect("/login")

        const wishlist = await Wishlist.findOne({ userId })
        .populate("items.productId").
        lean();

        if(!wishlist){
          return res.render("wishList",{ wishlist :{items : [] } });
        }

        const validItems = wishlist.items.filter( i => i.productId && i.productId._id );

        if(validItems.length !== wishlist.items.length){
          await Wishlist.updateOne({userId},{$set : {items : validItems } });
          wishlist.items = validItems;
        }

        return res.render("wishlist",{ wishlist });
        
        } catch (error) {

         console.log("loadwishlist error:",error);
         return res.status(500).send("Internal Server Error");
    }
};




const addToWishlist = async(req,res)=>{
    try {
        const userId = req.session.user;
        const productId = req.params.id || req.body.productId;

        if(!userId) return res.redirect("/login");
        
        const product = await Product.findById(productId).lean();
        if(!product) return res.redirect("/products-user?message=" + encodedURIComponent('Product not Found'))

        const cart = await Cart.findOne({ userId });

        if(cart && cart.items.some( i => i.productId.toString() === productId.toString())){
           return res.redirect('/products-user?message=' + encodeURIComponent('Product already in cart'));
        }
         
        let wishlist = await Wishlist.findOne({ userId })
        .populate("items.productId");
     

        if(!wishlist){
            wishlist = new Wishlist({ userId , items:[] });
        }

        const already = wishlist.items.some(
            i=>(i.productId?._id || i.productId)?.toString() === productId.toString()
        );

        if (already) {
    
    return res.redirect('/products-user?message=' + encodeURIComponent('Already in wishlist'));
}
        wishlist.items.push({ productId });
        await wishlist.save();

        return res.redirect("/products-user")

    } catch (err) {
         console.log(err);
        res.json({ success: false });
    }
}


const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.body;

    await Wishlist.updateOne(
      { userId },
      { $pull: { items: { productId } } }
    );

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
};


const moveToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.body;

   if(!userId) return res.redirect("/login");

    let cart = await Cart.findOne({ userId });
 
    if (!cart) {
      cart = new Cart({ userId, items: [],cartTotal :0 });
    }
   
    const exists = cart.items.find(i => i.productId.toString() === productId);

    if (exists) {
      exists.qty += 1;
    }else{
      cart.items.push( {productId, qty :1})
    }
    
    await cart.save();

    await Wishlist.updateOne(
      { userId },
      { $pull: { items: { productId: new mongoose.Types.ObjectId(productId)} } }
    );

   return res.redirect("/wishlist");

  } catch (err) {
    console.log(err);
    res.redirect("/wishlist");
  }
};



const toggleWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;

    
    if (!userId) {
      return res.redirect("/login");
    }

   
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).send("Invalid product ID");
    }

    
    const cart = await Cart.findOne({ userId });

    const inCart = cart?.items?.some(
      item => item.productId.toString() === productId
    );

    if (inCart) {
      return res.redirect("/wishlist?message=Product already in cart");
    }

   
    let wishlist = await Wishlist.findOne({ userId });

    
    if (!wishlist) {
      wishlist = new Wishlist({
        userId,
        items: [{ productId }]
      });

      await wishlist.save();
      return res.redirect("/products-user");
    }

    
    const index = wishlist.items.findIndex(
      item => item.productId.toString() === productId
    );

    if (index !== -1) {
    
      wishlist.items.splice(index, 1);
    } else {
      
      wishlist.items.push({ productId });
    }

    await wishlist.save();
    return res.redirect("/products-user");

  } catch (error) {
    console.error("Toggle Wishlist Error:", error);
    res.status(500).send("Server Error");
  }
};





module.exports = {
    loadWishlist,
    addToWishlist,
    removeFromWishlist,
    moveToCart,
    toggleWishlist
}
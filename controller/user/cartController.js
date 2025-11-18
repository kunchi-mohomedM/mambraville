const Product =require('../../models/productSchema');
const User = require("../../models/userSchema");
const Cart = require('../../models/cartSchema');

const addTocart=async(req,res)=>{
    try {
        const userId = req.session.user;
        if(!userId) return res.redirect("/login");

        const productId = req.params.id;
        if(!productId) return res.redirect("/products-user");

        const product = await Product.findById(productId)
        if(!product) return res.redirect("/products-user");

        let cart = await Cart.findOne({userId});

        if(!cart){
            cart=new Cart({
                userId,
                items:[],
                cartTotal:0
            });
        }

        const originalPrice=product.price;
        const discountPercentage = product.discount || 0;

        const finalprice = 
                originalPrice-(originalPrice * discountPercentage / 100);

        const existingItem = cart.items.find(
            item => item.productId.toString()===productId
        );

        if(existingItem){
            existingItem.qty +=1;
            existingItem.subtotal = existingItem.qty * finalprice;
        }else{
            cart.items.push({
                productId:product._id,

                name:product.productName,

                image:product.productImage[0],

                qty:1,

                price:originalPrice,

                discount:discountPercentage,

                subtotal:finalprice
            });
        }

        cart.cartTotal = cart.items.reduce((sum,item)=> sum+item.subtotal,0);

        await cart.save();

        return res.redirect("/cart");

    } catch (error) {
        console.log("Error occur while addtocart",error)
        return res.status(500).send("Internal server error");
    }
};


const loadCart=async(req,res)=>{
    try {
        const userId=req.session.user;
        if(!userId) return res.redirect("/login");

        let cart = await Cart.findOne({userId});

        if(!cart) {
            cart = {
                items:[],
                cartTotal:0
            };
        }

        return res.render("cartpage",{
            cart
        });
        


    } catch (error) {
        console.log("Error occur while loading cart:",error);
        return res.status(500).send("Internal Server Error");
    }
}


const increaseQty = async(req,res)=>{
    try {
        const userId = req.session.user;
        const productId = req.params.id;

        let cart = await Cart.findOne({userId});
        if(!cart) return res.redirect("/cart");

        const item=cart.items.find(i=>i.productId.toString()===productId);
        if(!item) return res.redirect("/cart");

        const product = await Product.findById(productId);
        if(!product) return res.redirect("/cart");

        if(item.qty + 1 > product.quantity){
            return res.status(400).send("Cannot add more than available stock");
        }

        item.qty += 1;
        const finalprice = product.price - (product.price * product.discount / 100);
        item.subtotal = item.qty * finalprice;

        cart.cartTotal = cart.items.reduce((sum,i)=>sum+i.subtotal,0);

        await cart.save();

        return res.redirect("/cart");
    } catch (error) {
        console.log("error occur while increase quantity",error);
        return res.status(500).send("Internal Server Error");
    }
};


const decreaseqty=async(req,res)=>{
    try {
        const userId = req.session.user;
        const productId =req.params.id;

        let cart=await Cart.findOne({userId})
        if(!cart) return res.redirect("/cart");

        const item = cart.items.find(i=>i.productId.toString()===productId);
        if(!item) return res.redirect("/cart");

        if(item.qty > 1){
            item.qty -= 1 ;
             const finalPrice= item.price - (item.price * item.discount/100)
             item.subtotal = item.qty*finalPrice
        }else{
            cart.items=cart.items.filter(i=>i.productId.toString()!==productId)
        }

       

        cart.cartTotal = cart.items.reduce((sum,i)=> sum + i.subtotal , 0)

        await cart.save();
        return res.redirect("/cart");

    } catch (error) {
        console.log("Error occur while decrease quantity",error);
        return res.status(500).send("Internal server Error");
    }
};



module.exports = {
    addTocart,
    loadCart,
    increaseQty,
    decreaseqty
};



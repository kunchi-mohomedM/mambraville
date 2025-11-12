const Category = require("../../models/categorySchema")
const Products = require("../../models/productSchema")
const brand=require("../../models/brandSchema")


const loadproductpage=async(req,res)=>{

    try {
        let query ={};

        let page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 4;
        let skip = (page-1)*limit;

        if(req.query.search){
            query.productName = {$regex:req.query.search,$options :"i"};
        }
        

        let sortOptions={createdAt:-1};
        switch (req.query.sort){
            case "newest":
                sortOptions= {createdAt:-1};
            break;
            case "oldest":
                sortOptions = { createdAt : 1 };
            break;
            case "priceasc":
                sortOptions = { price: 1 };
                break;
            case "pricedesc":
                sortOptions = { price: -1 };
                break ;
            case "popular":
                sortOptions = { quantity: -1 };
                break;
        }



        const products=await Products.find(query)
        .populate('category')
        .populate('brand')
        .sort(sortOptions)
        .limit(limit)
        .skip(skip)
        .exec();


        const totalProducts = await Products.countDocuments(query);
        const totalPages = Math.ceil(totalProducts/limit);
       // console.log(products)
        return res.render("productmanagement",{
            products,
             searchQuery: req.query.search || "",
             sort:req.query.sort || "newest",
             page,
             totalPages

        });

    } catch (error) {
        console.error("Error occur while rendering product page",error);
        res.status(500).send("Server Error");
    }
}

const loadaddproduct=async(req,res)=>{
    try {
        const categories=await Category.find({})
        const brands=await brand.find({})
        //console.log(categories,brands)
        return res.render("addproductpage",{categories,brands})
    } catch (error) {
        console.error("Error occured while rendering addproductpage",error)
    }
}

const addproducts =async(req,res)=>{
    console.log(req.body);
    try {
        const {
            productName,
            description,
            quantity,
            price,
            category,
            brand,
            discount
        }=req.body;

        const images=[];
        // console.log(req.files);
        if(req.files && req.files.length > 0){
            req.files.forEach(file=>{
                console.log(file)
                images.push(file.path.replace('public\\','/'));
            });
        }



        //console.log(images)
        const newProduct=new Products({
            productName,
            description,
            quantity,
            price,
            category,
            brand,
            discount,
            productImage:images,
        })

        
        await newProduct.save();

        res.status(200).redirect("/admin/products")
    } catch (error) {
        console.error("Error occured while adding products",error);
        res.status(500).json({
            success:false,
            message:"Failed to add products",
            error:error.message
        });
    }
};

const loadeditproduct=async(req,res)=>{
    try {
        const productId=req.params.id;
        const categories=await Category.find({})
        const brands=await brand.find({})
        const product = await Products.findById(productId)
        console.log(product)
        if(!product){
            return res.status(404).send("Product not found");
        }
        return res.render("editproductspage",{product,categories,brands})
    } catch (error) {
        console.error("Error occured while rendering edit products page",error)
    }
}

const editproduct = async(req, res) => {
    try {
        const productId = req.params.id;
        const { productName, description, price, discount, category, brand, quantity } = req.body;
        const existingImages = req.body.existingImages;
    
        const product = await Products.findById(productId);
        
        if (!product) {
            return res.status(404).send("Product not found");
        }
        
        let updatedImages = [];
        
        const existingImagesArray = Array.isArray(existingImages) ? existingImages : existingImages ? [existingImages] : [];
        
    
        const newImages = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
        
        for (let i = 0; i < 4; i++) {
            if (req.files && req.files[i]) {
                // If there's a new upload for this position, use it
                updatedImages[i] = newImages[i];
            } else if (existingImagesArray[i]) {
                
                updatedImages[i] = existingImagesArray[i];
            } else if (product.productImage && product.productImage[i]) {
                updatedImages[i] = product.productImage[i];
            }
        }
        
        const updatedProduct = await Products.findByIdAndUpdate(
            productId,
            {
                productName,
                description,
                price,
                discount,
                category,
                brand,
                quantity,
                productImage: updatedImages
            },
            { new: true }
        );
        
        res.redirect('/admin/products'); 
    } catch (error) {
        console.error("Error occurred while updating product:", error);
        res.status(500).send("Server error occurred");
    }
}

const deleteProductImage = async(req, res) => {
    try {
        const productId = req.params.productId;
        const imageIndex = req.params.imageIndex;
        
        const product = await Products.findById(productId);
        
        if (!product) {
            return res.status(404).send("Product not found");
        }
        

        if (product.productImage && product.productImage[imageIndex]) {
            const fs = require('fs');
            const path = require('path');
            const imagePath = path.join(__dirname, '..', 'public','uploads', product.productImage[imageIndex]);
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            
    
            product.productImage.splice(imageIndex, 1);
            product.productImage.push('');
            
            await product.save();
        }
        
        // Redirect back to the edit page
        res.status(200).json({message:"Succesfully deleted"})
    } catch (error) {
        console.error("Error deleting product image:", error);
        res.status(500).send("Server error occurred");
    }
}


const toggleDeletedproduct=async(req,res)=>{
    try {
        const {productId}=req.body

        const product= await Products.findById(productId)
        if(!product){
            return res.status(404).json({error:'product not found'})
        }
        product.isDeleted = !product.isDeleted
        product.status = product.isDeleted ? 'Discontinued' : 'Available';
        await product.save();

        return res.status(200).json({ message: 'Product status updated' }); 

    } catch (error) {
        console.error('Error updating product status:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

module.exports={
    loadproductpage,
    loadaddproduct,
    addproducts,
    loadeditproduct,
    editproduct,
    deleteProductImage,
    toggleDeletedproduct
}
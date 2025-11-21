const Category = require("../../models/categorySchema")
const brand=require("../../models/brandSchema")
const cloudinary = require('../../config/cloudinary');
const Product = require("../../models/productSchema");

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



        const products=await Product.find(query)
        .populate('category')
        .populate('brand')
        .sort(sortOptions)
        .limit(limit)
        .skip(skip)
        .exec();


        const totalProducts = await Product.countDocuments(query);
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

// productController.addproducts - FIXED VERSION
const addproducts = async (req, res) => {
    try {
        const {
            productName,
            description,
            price,
            discount = 0,
            quantity,
            category,
            brand,
        } = req.body;

        if (!req.files || req.files.length !== 4) {
            return res.status(400).json({
                success: false,
                message: "Exactly 4 images are required."
            });
        }

        // CORRECT WAY: Wrap upload_stream in a Promise
        const uploadToCloudinary = (buffer) => {
            return new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        folder: "mambraville/products",
                        transformation: [
                            { width: 1200, height: 1200, crop: "limit" },
                            { quality: "auto", fetch_format: "auto" }
                        ]
                    },
                    (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    }
                );
                uploadStream.end(buffer);
            });
        };

        // Upload all 4 images
        const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));

        const results = await Promise.all(uploadPromises); // Now this actually waits!

        const uploadedImages = results.map(result => ({
            url: result.secure_url,
            public_id: result.public_id
        }));

        const newProduct = new Product({
            productName: productName.trim(),
            description: description.trim(),
            price: Number(price),
            discount: Number(discount || 0),
            quantity: Number(quantity),
            category,
            brand,
            productImage: uploadedImages
        });

        await newProduct.save();

        return res.status(200).json({
            success: true,
            message: "Product added successfully",
            redirect: "/admin/products"
        });

    } catch (error) {
        console.error("Add product error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

const loadeditproduct=async(req,res)=>{
    try {
        const productId=req.params.id;
        const categories=await Category.find({})
        const brands=await brand.find({})
        const product = await Product.findById(productId)
        console.log(product)
        if(!product){
            return res.status(404).send("Product not found");
        }
        return res.render("editproductspage",{product,categories,brands})
    } catch (error) {
        console.error("Error occured while rendering edit products page",error)
    }
}


const editproduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const { productName, description, price, discount = 0, quantity, category, brand, keepPublicIds } = req.body;

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        const keepIds = Array.isArray(keepPublicIds) ? keepPublicIds : keepPublicIds ? [keepPublicIds] : [];

        // Delete replaced images from Cloudinary
        const currentIds = product.productImage.map(img => img.public_id);
        const idsToDelete = currentIds.filter(id => !keepIds.includes(id));
        for (const id of idsToDelete) {
            await cloudinary.uploader.destroy(id);
        }

        // Upload new images
        let newUploaded = [];
        if (req.files?.length > 0) {
            const uploadToCloudinary = (buffer) => new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    {
                        folder: "mambraville/products",
                        transformation: [
                            { width: 1200, height: 1200, crop: "limit" },
                            { quality: "auto", fetch_format: "auto" }
                        ]
                    },
                    (error, result) => error ? reject(error) : resolve(result)
                ).end(buffer);
            });

            const results = await Promise.all(req.files.map(file => uploadToCloudinary(file.buffer)));
            newUploaded = results.map(r => ({
                url: r.secure_url,
                public_id: r.public_id
            }));
        }

        // Build final images: new ones first, then kept old ones
        const keptImages = product.productImage.filter(img => keepIds.includes(img.public_id));
        const finalImages = [...newUploaded, ...keptImages].slice(0, 4);

        await Product.findByIdAndUpdate(productId, {
            productName: productName.trim(),
            description: description.trim(),
            price: Number(price),
            discount: Number(discount),
            quantity: Number(quantity),
            category,
            brand,
            productImage: finalImages
        });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const deleteProductImage = async(req, res) => {
    try {
        const productId = req.params.productId;
        const imageIndex = req.params.imageIndex;
        
        const product = await Product.findById(productId);
        
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

        const product= await Product.findById(productId)
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
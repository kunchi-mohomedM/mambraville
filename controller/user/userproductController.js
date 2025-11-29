const Category = require("../../models/categorySchema");
const Products=require("../../models/productSchema")

const loadUserProducts = async (req, res) => {
    try {
        let query = { isDeleted: false };
        console.log(req.query);

        // Pagination variables
        let page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 4;
        let skip = (page - 1) * limit;

        let categoryDoc=null;
        // Filtering by category
        if (req.query.category) {
             categoryDoc = await Category.findOne({ categoryname:req.query.category });
            if(categoryDoc){
                query.category = categoryDoc._id;
            }else{
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

        // Get total products count for pagination
        const totalProducts = await Products.countDocuments(query);

        // Fetch filtered & paginated products
        const products = await Products.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(limit);

        res.render('products', {
            products,
            categoryDoc,
            currentPage: page,
            totalPages: Math.ceil(totalProducts / limit),
            totalProducts,
            queryParams: req.query,
            searchQuery: req.query.search || ""
        });

    } catch (error) {
        console.error("Error occurred while rendering products page:", error);
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest' || req.query.format === 'json') {
            return res.status(500).json({ status: 'error', message: "An error occurred while loading products." });
        }
        res.status(500).send("An error occurred while loading products..");
    }
};



const loadproductdetails=async(req,res)=>{
    try {
        const productId=req.params.id;
        const product=await Products.findOne({_id:productId,isDeleted:false})
        if(!product) return res.status(404).send("Product not found")

        const category = await Category.findById(product.category)
        const relatedProducts=await Products.find({isDeleted:false})
        .sort({categoryname:-1})
        .limit(4)
        console.log(category)
        res.render("productdetails",{product,category,relatedProducts})
    } catch (error) {
        console.error("Error occued while rendering productdetails page",error)
    }
}


module.exports={
    loadUserProducts,
    loadproductdetails

}
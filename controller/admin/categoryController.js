const Category = require("../../models/categorySchema");



const categoryInfo = async (req, res) => {
    try {

        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const categoryData = await Category.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit)
        res.render("category", {
            categories: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories
        });


    } catch (error) {
        console.error(error);
        res.redirect("/pageerror")
    }
}

const addCategory = async (req, res) => {

    const { categoryname, categorydesc } = req.body;




    if (!categoryname || typeof categoryname !== 'string' || categoryname.trim() === '') {
        return res.status(400).json({ error: 'Category name is required and must be a non-empty string' });
    }

    try {

        const existingCategory = await Category.findOne({
            categoryname: { $regex: new RegExp(`^${categoryname.trim()}$`, 'i') }
        });

        if (existingCategory) {
            return res.status(400).json({ error: 'Category already exists' });
        }


        const newCategory = new Category({
            categoryname: categoryname.trim(),
            description: categorydesc ? categorydesc.trim() : ''
        });

        const savedCategory = await newCategory.save();

        return res.status(201).json({
            message: 'Category added successfully',
            category: {
                id: savedCategory._id,
                name: savedCategory.categoryname,
                description: savedCategory.categorydesc
            }
        });
    } catch (error) {
        console.error('Error adding category:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const loadaddCategory = async (req, res) => {
    try {
        return res.render("addCategory", {});
    } catch (error) {
        console.error("Error occured while rendering add category page", error)
    }
}

const editCategory = async (req, res) => {
    try {
        const { categoryId, categoryname, categorydesc } = req.body;

        if (!categoryname || typeof categoryname !== 'string' || categoryname.trim() === '') {
            req.flash('error', 'Category name cannot be empty');
            return res.redirect(`/admin/editCategory/${categoryId}`);
        }

        const trimmedName = categoryname.trim();

        const existingCategory = await Category.findOne({
            categoryname: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
            _id: { $ne: categoryId }
        });

        if (existingCategory) {
            req.flash('error', 'Category name already exists. Please choose another name.');
            return res.redirect(`/admin/editCategory/${categoryId}`);
        }

        await Category.findByIdAndUpdate(categoryId, {
            categoryname: trimmedName,
            description: categorydesc ? categorydesc.trim() : ''
        });

        // Success → back to list
        req.flash('success', 'Category updated successfully.');
        res.redirect("/admin/category");

    } catch (error) {
        console.error("Error editing category: ", error);

        // Redirect back to edit page with error
        req.flash('error', 'Error updating category. Please try again.');
        res.redirect(`/admin/editCategory/${req.body.categoryId || ''}`);
    }
};
const deleteCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        await Category.findByIdAndDelete(categoryId);
        req.flash('success', 'Category deleted successfully.');
        res.redirect("/admin/category");
    } catch (error) {
        console.error("Error deleting Category :", error);
        req.flash('error', 'Error deleting category.');
        res.redirect("/admin/category");
    }
};


const loadeditcategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const category = await Category.findById(categoryId)
        if (!category) {
            return res.status(404).send("Category not found")
        }
        return res.render("editcategory", { category })
    } catch (error) {
        console.error("Error occured while rendering edit category page", error)
    }
}


module.exports = {
    categoryInfo,
    addCategory,
    loadaddCategory,
    loadeditcategory,
    editCategory,
    deleteCategory
}
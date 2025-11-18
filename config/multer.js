// upload.js  (Replace your current multer config with this)

const multer = require('multer');

// Use memory storage instead of diskStorage
const storage = multer.memoryStorage();  // This keeps files in RAM (buffer)

const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|webp/;
  const mimetype = filetypes.test(file.mimetype);
  const extname = filetypes.test(require('path').extname(file.originalname).toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only image files (jpeg, jpg, png, webp) are allowed!'), false);
};

const upload = multer({
  storage: storage,                    // In memory, no disk write
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

module.exports = upload;
import multer from "multer";

// Direct memory storage (No disk folder created)
const storage = multer.memoryStorage();

const uploadS3 = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // Optional 100MB limit
  },
});

export default uploadS3;

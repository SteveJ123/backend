import dns from "node:dns";
import mongoose from "mongoose";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const connectDB = async () => {
  try {
    console.log("Connecting to MongoDB Atlas...");

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB Atlas Connected Successfully");
  } catch (error) {
    console.error("MongoDB Atlas Connection Error:", error);
    process.exit(1);
  }
};

export default connectDB;

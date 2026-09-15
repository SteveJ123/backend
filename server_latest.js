import dns from "dns";
import path from "path";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import fs from "fs";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// __dirname is not available directly in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DNS configuration
dns.setDefaultResultOrder("ipv4first");

// Load environment variables FIRST
dotenv.config({
  path: path.join(__dirname, ".env"),
});

// Import database connection
import db from "./config/db.js";
// import Post from "./models/Post.js";
// import User from "./models/User.js";
// import Comment from "./models/Comment.js";
// import Course from "./models/Course.js";
// import Notification from "./models/Notification.js";
import courseRoutes from "./routes/courseDetails.js"; // Adjust path according to your folder structure
// import LiveSession from "./models/LiveSession.js";
// import Product from "./models/Product.js";
// import PersonalDetails from "./models/PersonalDetails.js";
// import AdminPost from "./models/AdminPost.js";
// import SupportTeam from "./models/SupportTeam.js";
// import AdminComment from "./models/AdminComment.js";

// import upload from "./middleware/upload.js";

// const { Upload } = require("@aws-sdk/lib-storage");
import { Upload } from "@aws-sdk/lib-storage";
import multer from "multer";
// Ensure 'uploads' directory exists
// if (!fs.existsSync("./uploads")) {
//   fs.mkdirSync("./uploads");
// }
const upload = multer();

const app = express();

// 1. Allowed Origins List
const allowedOrigins = [
  "https://www.younghappyandhealthy.com",
  "https://younghappyandhealthy.com", // Include both with and without 'www'
  "http://localhost:3000", // For local development
  "http://localhost:5173", // Vite local port (if using Vite)
  "http://localhost:4200", // Angular local port
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like Postman, Curl, or mobile apps)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.error("CORS blocked origin:", origin);
        // Pass false instead of an Error object to prevent 500 crashes
        return callback(null, false);
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-language",
      "X-Language",
      "Accept",
      "*",
    ],
    AllowedOrigins: ["*"],
    ExposeHeaders: [],
    credentials: true,
    optionsSuccessStatus: 200, // Fixes issues with legacy browsers/proxies
  }),
);
// 3. Handle Preflight OPTIONS Requests explicitly
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Connect to MongoDB Atlas
// connectDB();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucketName = process.env.AWS_BUCKET_NAME;

/**
 * Generates a presigned PUT URL for client-side direct S3 uploads
 */
export const generateUploadUrl = async (fileType, folder = "media") => {
  const extension = fileType.split("/")[1] || "bin";
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: fileName,
    ContentType: fileType,
  });

  // URL expires in 5 minutes (300 seconds)
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
  const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

  return { uploadUrl, fileUrl, fileName };
};

// app.post("/api/register", async (req, res) => {
//   try {
//     const { username, mobile, password, courseType, language, role } = req.body;

//     // 1. Check if required fields are provided
//     if (!username || !mobile || !password || !courseType || !language) {
//       return res
//         .status(400)
//         .json({ message: "All required fields must be provided." });
//     }

//     // 2. Check if user with mobile already exists
//     const existingUser = await User.findOne({ mobile });
//     if (existingUser) {
//       return res
//         .status(400)
//         .json({ message: "Mobile number is already registered." });
//     }

//     // 3. Hash the password
//     const salt = await bcrypt.genSalt(10);
//     const passwordHash = await bcrypt.hash(password, salt);

//     // 4. Create new user document
//     const newUser = new User({
//       username,
//       mobile,
//       passwordHash,
//       courseType,
//       language,
//       role: role || "user", // Defaults to "user" unless specified
//     });

//     await newUser.save();

//     const personalDetails = new PersonalDetails({
//       userId: newUser._id,
//       name: username, // Maps the registration username to name
//       language: language, // Matches the language chosen at registration
//     });

//     await personalDetails.save();

//     res.status(201).json({
//       message: "User registered successfully",
//       userId: newUser._id,
//     });
//   } catch (error) {
//     console.error("Registration Error:", error);
//     res.status(500).json({ message: "Server error during registration." });
//   }
// });

app.post("/api/register", async (req, res) => {
  // Acquire a dedicated connection from the pool for transaction safety
  const connection = await db.getConnection();

  try {
    const { username, mobile, password, courseType, language, role } = req.body;

    // 1. Check if required fields are provided
    if (!username || !mobile || !password || !courseType || !language) {
      connection.release();
      return res
        .status(400)
        .json({ message: "All required fields must be provided." });
    }

    // 2. Check if user with mobile already exists
    const [existingUsers] = await connection.execute(
      "SELECT id FROM register WHERE mobile = ? LIMIT 1",
      [mobile],
    );

    if (existingUsers.length > 0) {
      connection.release();
      return res
        .status(400)
        .json({ message: "Mobile number is already registered." });
    }

    // 3. Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Start database transaction
    await connection.beginTransaction();

    // 4. Insert new user into `register` table
    const [userResult] = await connection.execute(
      `INSERT INTO register (username, mobile, passwordHash, courseType, language, role) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, mobile, passwordHash, courseType, language, role || "user"],
    );

    const newUserId = userResult.insertId;

    // 5. Insert personal details linking to `newUserId`
    await connection.execute(
      `INSERT INTO personaldetails (userId, name, language) 
       VALUES (?, ?, ?)`,
      [newUserId, username, language],
    );

    // Commit transaction
    await connection.commit();
    connection.release();

    return res.status(201).json({
      message: "User registered successfully",
      userId: newUserId,
    });
  } catch (error) {
    // Rollback changes if any query fails
    await connection.rollback();
    connection.release();

    console.error("Registration Error:", error);
    return res
      .status(500)
      .json({ message: "Server error during registration." });
  }
});

app.get("/api/registered-users", async (req, res) => {
  try {
    const { courseType } = req.query;

    // Filter query construction
    let query = {};
    if (courseType) {
      query.courseType = courseType;
    }

    const users = await User.find(query, {
      username: 1,
      mobile: 1,
      role: 1,
      courseType: 1,
      language: 1,
      createdAt: 1,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Fetch Users Error:", error);
    return res
      .status(500)
      .json({ message: "Server error while fetching registered users" });
  }
});

app.put("/api/registered-users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, mobile, role, courseType } = req.body;

    // Validate courseType enum
    const allowedCourses = ["Face Yoga", "Face Yoga + Raj Yoga"];
    if (courseType && !allowedCourses.includes(courseType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid course type provided.",
      });
    }

    // Build update object dynamically
    const updateFields = {};
    if (username !== undefined) updateFields.username = username;
    if (mobile !== undefined) updateFields.mobile = mobile;
    if (role !== undefined) updateFields.role = role;
    if (courseType !== undefined) updateFields.courseType = courseType;

    // Perform update in MongoDB
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updateFields },
      {
        new: true, // Return updated document
        runValidators: true, // Run Mongoose schema validation
        projection: {
          username: 1,
          mobile: 1,
          role: 1,
          courseType: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User updated successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update User Error:", error);

    // Handle MongoDB duplicate key error (e.g., duplicate mobile number)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Mobile number already in use by another account.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while updating user.",
    });
  }
});

app.delete("/api/registered-users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Remove user from MongoDB collection
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully.",
      data: {
        id: deletedUser._id,
        username: deletedUser.username,
      },
    });
  } catch (error) {
    console.error("Delete User Error:", error);

    // Handle invalid MongoDB ObjectId format
    if (error.kind === "ObjectId") {
      return res.status(400).json({
        success: false,
        message: "Invalid User ID format.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while deleting user.",
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res
        .status(400)
        .json({ message: "Mobile and password are required" });
    }

    // 1. Fetch user & matched profile image using a single LEFT JOIN query
    const [rows] = await db.execute(
      `SELECT 
        u.id, 
        u.username, 
        u.mobile, 
        u.passwordHash, 
        u.role, 
        u.courseType, 
        u.language, 
        p.profileImage 
       FROM register u 
       LEFT JOIN personaldetails p 
         ON u.id = p.userId AND p.language = u.language 
       WHERE u.mobile = ? 
       LIMIT 1`,
      [mobile],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "User not registered. Please sign up first." });
    }

    const user = rows[0];

    // 2. Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Invalid mobile number or password" });
    }

    const profileImage = user.profileImage || "";
    console.log("profileImage", profileImage);

    // 3. Generate JWT Token
    const token = jwt.sign(
      {
        userId: user.id,
        mobile: user.mobile,
        role: user.role,
        language: user.language,
        profileImage,
      },
      process.env.JWT_SECRET || "YOUR_JWT_SECRET_KEY",
      { expiresIn: "1d" },
    );

    // 4. Return success response with user details & profileImage
    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      id: user.id,
      role: user.role,
      username: user.username,
      courseType: user.courseType,
      language: user.language,
      profileImage,
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Server error during login" });
  }
});

const getMediaTypeFromUrl = (url = "") => {
  const cleanUrl = url.split("?")[0].toLowerCase(); // Strip query params if any
  if (/\.(jpg|jpeg|png|webp|gif|svg)$/.test(cleanUrl)) return "image";
  if (/\.(mp4|webm|ogg|mov|mkv)$/.test(cleanUrl)) return "video";
  if (/\.(mp3|wav|aac|m4a|flac)$/.test(cleanUrl)) return "audio";
  return "file";
};

// app.post("/api/posts", async (req, res) => {
//   try {
//     const { userId, content, tagIds, fileLink, fileLinks, targetLanguage } =
//       req.body;

//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "userId is required to create a post.",
//       });
//     }

//     // 1. Fetch author details to enforce language & course type rules
//     const author = await User.findById(userId);
//     if (!author) {
//       return res.status(404).json({
//         success: false,
//         message: "Post author not found in database.",
//       });
//     }

//     // Determine target post language:
//     const postLanguage =
//       author.role === "admin"
//         ? targetLanguage || author.language
//         : author.language;

//     // Safely parse JSON strings sent from Angular FormData/JSON
//     let parsedTagIds = [];
//     if (tagIds) {
//       try {
//         parsedTagIds = typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
//       } catch (e) {
//         parsedTagIds = [];
//       }
//     }

//     // 2. Process incoming S3 file URLs (supports single string or array)
//     const rawLinks = fileLinks
//       ? Array.isArray(fileLinks)
//         ? fileLinks
//         : [fileLinks]
//       : fileLink
//         ? [fileLink]
//         : [];

//     const mediaFiles = rawLinks
//       .filter((link) => typeof link === "string" && link.trim() !== "")
//       .map((link) => ({
//         fileLink: link.trim(),
//         mediaType: getMediaTypeFromUrl(link),
//       }));

//     // 3. Create the post
//     const newPost = new Post({
//       userId,
//       content: content || "",
//       tagIds: parsedTagIds,
//       courseType: author.courseType,
//       language: postLanguage,
//       mediaFiles,
//     });

//     await newPost.save();

//     // 4. Build target recipients query matched strictly by POST LANGUAGE
//     const targetUsers = await User.find({
//       _id: { $ne: author._id },
//       $or: [{ language: postLanguage }, { role: "admin" }],
//     }).select("_id");

//     // 5. Bulk insert notification records
//     if (targetUsers.length > 0) {
//       const notifications = targetUsers.map((user) => ({
//         recipient: user._id,
//         sender: author._id,
//         postId: newPost._id,
//         postModel: "Post",
//         postContentSnippet: content ? content.trim() : "Uploaded media post.",
//         isRead: false,
//       }));

//       await Notification.insertMany(notifications);
//     }

//     return res.status(201).json({
//       success: true,
//       message: "Post created and notifications queued successfully.",
//       data: newPost,
//     });
//   } catch (error) {
//     console.error("Error creating post:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });
// sql
app.post("/api/posts", async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { userId, content, tagIds, fileLink, fileLinks, targetLanguage } =
      req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required to create a post.",
      });
    }

    // 1. Fetch author details to enforce language & course type rules
    const [authors] = await connection.execute(
      "SELECT id, role, language, courseType FROM register WHERE id = ?",
      [userId],
    );

    if (authors.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Post author not found in database.",
      });
    }

    const author = authors[0];

    // Determine target post language
    const postLanguage =
      author.role === "admin"
        ? targetLanguage || author.language
        : author.language;

    // Safely parse JSON strings sent from Angular FormData/JSON
    let parsedTagIds = [];
    if (tagIds) {
      try {
        parsedTagIds = typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
      } catch (e) {
        parsedTagIds = [];
      }
    }

    // 2. Process incoming S3 file URLs
    const rawLinks = fileLinks
      ? Array.isArray(fileLinks)
        ? fileLinks
        : [fileLinks]
      : fileLink
        ? [fileLink]
        : [];

    const mediaFiles = rawLinks
      .filter((link) => typeof link === "string" && link.trim() !== "")
      .map((link) => ({
        fileLink: link.trim(),
        mediaType: getMediaTypeFromUrl(link),
      }));

    // Start transaction for atomic Post & Notifications insertion
    await connection.beginTransaction();

    // 3. Create the post
    const insertPostQuery = `
      INSERT INTO posts 
        (userId, content, tagIds, courseType, language, mediaFiles) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const [postResult] = await connection.execute(insertPostQuery, [
      userId,
      content ? content.trim() : "",
      JSON.stringify(parsedTagIds),
      author.courseType || null,
      postLanguage,
      JSON.stringify(mediaFiles),
    ]);

    const newPostId = postResult.insertId;

    // 4. Build target recipients query matched strictly by POST LANGUAGE
    const [targetUsers] = await connection.execute(
      "SELECT id FROM register WHERE id != ? AND (language = ? OR role = 'admin')",
      [userId, postLanguage],
    );

    // 5. Bulk insert notification records
    if (targetUsers.length > 0) {
      const snippet = content ? content.trim() : "Uploaded media post.";

      const notificationValues = targetUsers.map((user) => [
        user.id, // recipientId
        author.id, // senderId
        "post", // type
        newPostId, // postId
        "Post", // postModel
        snippet, // postContentSnippet
        false, // isRead
      ]);

      const insertNotificationsQuery = `
        INSERT INTO notifications 
          (recipientId, senderId, type, postId, postModel, postContentSnippet, isRead) 
        VALUES ?
      `;

      // mysql2 uses query() format for bulk multi-row inserts (VALUES ?)
      await connection.query(insertNotificationsQuery, [notificationValues]);
    }

    // Commit transaction
    await connection.commit();

    // Construct return data matching MongoDB output schema
    const newPost = {
      _id: newPostId,
      userId,
      content: content ? content.trim() : "",
      tagIds: parsedTagIds,
      courseType: author.courseType,
      language: postLanguage,
      mediaFiles,
      likeCount: 0,
      likes: [],
      views: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return res.status(201).json({
      success: true,
      message: "Post created and notifications queued successfully.",
      data: newPost,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error creating post:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  } finally {
    connection.release();
  }
});

// sql
app.get("/api/posts", async (req, res) => {
  try {
    const { language } = req.query;

    let formattedLang;
    if (language) {
      const lower = language.toLowerCase();
      if (lower === "te" || lower === "telugu") formattedLang = "Telugu";
      if (lower === "en" || lower === "english") formattedLang = "English";
    }

    // 1. Fetch Posts with Author details and PersonalDetails profile
    let postsQuery = `
      SELECT 
        p.id,
        p.content,
        p.courseType,
        p.language,
        p.mediaFiles,
        p.tagIds,
        p.likeCount,
        p.likes,
        p.views,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        u.id AS author_id,
        u.username AS author_username,
        u.mobile AS author_mobile,
        u.role AS author_role,
        u.courseType AS author_courseType,
        u.language AS author_language,
        COALESCE(pd.name, u.username, 'Unknown User') AS author_name,
        COALESCE(pd.profileImage, '') AS author_profileImage
      FROM posts p
      LEFT JOIN register u 
        ON p.userId = u.id
      LEFT JOIN personaldetails pd 
        ON u.id = pd.userId 
       AND pd.language = COALESCE(p.language, u.language)
    `;

    const queryParams = [];
    if (formattedLang) {
      postsQuery += ` WHERE p.language = ? OR u.language = ?`;
      queryParams.push(formattedLang, formattedLang);
    }

    postsQuery += ` ORDER BY p.created_at DESC`;

    const [postRows] = await db.execute(postsQuery, queryParams);

    if (postRows.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // Extract post IDs to batch-fetch comments
    const postIds = postRows.map((post) => post.id);

    // 2. Fetch all comments for these posts along with Comment Author profiles
    const placeholders = postIds.map(() => "?").join(",");
    const commentsQuery = `
      SELECT 
        c.id,
        c.postId,
        c.content,
        c.created_at AS createdAt,
        u.id AS comment_author_id,
        u.username AS comment_author_username,
        COALESCE(pd.name, u.username, 'Unknown User') AS comment_author_name,
        COALESCE(pd.profileImage, '') AS comment_author_profileImage
      FROM comments c
      LEFT JOIN register u 
        ON c.userId = u.id
      LEFT JOIN posts p 
        ON c.postId = p.id
      LEFT JOIN personaldetails pd 
        ON u.id = pd.userId 
       AND pd.language = COALESCE(p.language, u.language)
      WHERE c.postId IN (${placeholders})
      ORDER BY c.created_at ASC
    `;

    const [commentRows] = await db.execute(commentsQuery, postIds);

    // 3. Group comments by postId
    const commentsByPostId = {};
    commentRows.forEach((comment) => {
      if (!commentsByPostId[comment.postId]) {
        commentsByPostId[comment.postId] = [];
      }
      commentsByPostId[comment.postId].push({
        _id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        userId: {
          _id: comment.comment_author_id,
          username: comment.comment_author_username,
          name: comment.comment_author_name,
          profileImage: comment.comment_author_profileImage,
        },
      });
    });

    // 4. Map final response payload to retain MongoDB structure
    const posts = postRows.map((post) => {
      const allComments = commentsByPostId[post.id] || [];

      // Parse JSON columns if stored as JSON strings in MySQL
      let mediaFiles = post.mediaFiles;
      let tagIds = post.tagIds;
      let likes = post.likes;

      if (typeof mediaFiles === "string")
        mediaFiles = JSON.parse(mediaFiles || "[]");
      if (typeof tagIds === "string") tagIds = JSON.parse(tagIds || "[]");
      if (typeof likes === "string") likes = JSON.parse(likes || "[]");

      return {
        _id: post.id,
        content: post.content,
        courseType: post.courseType,
        language: post.language,
        mediaFiles,
        tagIds,
        likeCount: post.likeCount || 0,
        likes,
        views: post.views || 0,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        commentCount: allComments.length,
        allComments,
        userId: {
          _id: post.author_id || post.userId,
          username: post.author_username,
          name: post.author_name,
          mobile: post.author_mobile,
          role: post.author_role,
          courseType: post.author_courseType,
          language: post.author_language,
          profileImage: post.author_profileImage,
        },
      };
    });

    return res.status(200).json({ success: true, data: posts });
  } catch (error) {
    console.error("Error fetching posts:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});
// sql
app.get("/api/posts/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate if the userId is a valid integer/number
    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    // Single query joining posts with comments to compute commentCount directly in SQL
    const query = `
      SELECT 
        p.id,
        p.userId,
        p.content,
        p.courseType,
        p.language,
        p.mediaFiles,
        p.tagIds,
        p.likeCount,
        p.likes,
        p.views,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        COUNT(c.id) AS commentCount
      FROM posts p
      LEFT JOIN comments c ON p.id = c.postId
      WHERE p.userId = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;

    const [rows] = await db.execute(query, [parsedUserId]);

    // Format final response to match MongoDB structure
    const posts = rows.map((post) => {
      let mediaFiles = post.mediaFiles;
      let tagIds = post.tagIds;
      let likes = post.likes;

      // Safely parse JSON strings if stored as JSON/TEXT columns in MySQL
      if (typeof mediaFiles === "string")
        mediaFiles = JSON.parse(mediaFiles || "[]");
      if (typeof tagIds === "string") tagIds = JSON.parse(tagIds || "[]");
      if (typeof likes === "string") likes = JSON.parse(likes || "[]");

      return {
        _id: post.id,
        userId: post.userId,
        content: post.content,
        courseType: post.courseType,
        language: post.language,
        mediaFiles,
        tagIds,
        likeCount: post.likeCount || 0,
        likes,
        views: post.views || 0,
        commentCount: Number(post.commentCount),
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      count: posts.length,
      data: posts,
    });
  } catch (error) {
    console.error("Error fetching user posts:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// app.post("/api/comments", async (req, res) => {
//   try {
//     const { postId, userId, content, parentId, username, language } = req.body;
//     console.log("language", language);

//     if (!postId || !userId || !content?.trim() || !username?.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "postId, userId, content, and username are required fields.",
//       });
//     }

//     // 1. Fetch parent Post to check language context
//     const post = await Post.findById(postId).lean();
//     if (!post) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found." });
//     }

//     // Determine target language context (fallback to post language or payload)
//     const postLanguage = language || post.language || "English";

//     // 2. Fetch corresponding profile details for this user and language
//     const profile = await mongoose
//       .model("PersonalDetails")
//       .findOne({
//         userId: new mongoose.Types.ObjectId(userId),
//         language: postLanguage,
//       })
//       .lean();

//     // 3. Create comment
//     const newComment = await Comment.create({
//       postId,
//       userId,
//       username: username.trim(),
//       content: content.trim(),
//       parentId: parentId || null,
//     });

//     const commentData = newComment.toObject();

//     // 4. Send targeted notifications
//     const targetUsers = await User.find({
//       _id: { $ne: new mongoose.Types.ObjectId(userId) }, // Exclude commenter
//       $or: [
//         { language: postLanguage }, // All users in that language group
//         { role: "admin" }, // All admins
//       ],
//     }).select("_id");

//     if (targetUsers.length > 0) {
//       const notifications = targetUsers.map((recipient) => ({
//         recipient: recipient._id,
//         sender: userId,
//         postId: post._id,
//         postModel: "Post",
//         commentId: newComment._id,
//         postContentSnippet: content.trim(),
//         type: "comment",
//         language: postLanguage,
//         isRead: false,
//       }));

//       await Notification.insertMany(notifications);
//     }

//     // 5. Return new comment enriched with user details
//     return res.status(201).json({
//       ...commentData,
//       userId: {
//         _id: userId.toString(),
//         username: username.trim(),
//         profileImage: profile?.profileImage || "",
//       },
//     });
//   } catch (error) {
//     console.error("Error submitting comment:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error submitting comment",
//       error: error.message,
//     });
//   }
// });

// app.post("/api/admin-comments", async (req, res) => {
//   try {
//     const { postId, userId, content, parentId, username } = req.body;

//     if (!postId || !userId || !content?.trim() || !username?.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "postId, userId, username, and content are required fields.",
//       });
//     }

//     // 1. Fetch parent AdminPost to confirm existence
//     const adminPost = await AdminPost.findById(postId).lean();
//     if (!adminPost) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Admin post not found." });
//     }

//     // 2. Fetch profile details matching ONLY userId (no language restriction)
//     const userObjId = mongoose.Types.ObjectId.isValid(userId)
//       ? new mongoose.Types.ObjectId(userId)
//       : userId;

//     const profile = await mongoose
//       .model("PersonalDetails")
//       .findOne({
//         $or: [{ userId: userObjId }, { userId: userId.toString() }],
//       })
//       .sort({ profileImage: -1, createdAt: -1 }) // Prioritizes records with a profile image, then latest
//       .lean();

//     // 3. Create admin comment
//     const newComment = await AdminComment.create({
//       postId,
//       userId,
//       username: username.trim(),
//       content: content.trim(),
//       parentId: parentId || null,
//     });

//     const commentData = newComment.toObject();

//     // 4. Return enriched comment with guaranteed userId structure and profileImage
//     return res.status(201).json({
//       ...commentData,
//       userId: {
//         _id: userId.toString(),
//         username: username.trim(),
//         profileImage: profile?.profileImage || "",
//       },
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Error submitting comment",
//       error: error.message,
//     });
//   }
// });

// GET /api/comments/post/:postId

// sql
app.post("/api/comments", async (req, res) => {
  try {
    const { postId, userId, content, parentId, username, language } = req.body;
    console.log("language", language);

    if (!postId || !userId || !content?.trim() || !username?.trim()) {
      return res.status(400).json({
        success: false,
        message: "postId, userId, content, and username are required fields.",
      });
    }

    // 1. Fetch parent Post to verify existence & check language context
    const [posts] = await db.execute(
      "SELECT id, language FROM posts WHERE id = ?",
      [postId],
    );

    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    const postLanguage = language || posts[0].language || "English";

    // 2. Fetch corresponding profile details for this user and language
    const [profiles] = await db.execute(
      "SELECT profileImage FROM personaldetails WHERE userId = ? AND language = ? LIMIT 1",
      [userId, postLanguage],
    );

    const profileImage = profiles.length > 0 ? profiles[0].profileImage : "";

    // 3. Create comment
    const cleanParentId = parentId ? parentId : null;
    const [commentResult] = await db.execute(
      `INSERT INTO comments (postId, userId, username, content, parentId) 
       VALUES (?, ?, ?, ?, ?)`,
      [postId, userId, username.trim(), content.trim(), cleanParentId],
    );

    const commentId = commentResult.insertId;

    // 4. Fetch target users for notifications (Exclude commenter; include matching language or admin role)
    const [targetUsers] = await db.execute(
      `SELECT id FROM register 
       WHERE id != ? AND (language = ? OR LOWER(TRIM(role)) = 'admin')`,
      [userId, postLanguage],
    );

    // Bulk insert notifications if target users exist
    if (targetUsers.length > 0) {
      const notificationValues = [];
      const notificationParams = [];

      for (const recipient of targetUsers) {
        notificationValues.push("(?, ?, ?, ?, ?, ?, ?, ?)");
        notificationParams.push(
          recipient.id, // recipient
          userId, // sender
          postId, // postId
          commentId, // commentId
          content.trim(), // postContentSnippet
          "comment", // type
          postLanguage, // language
          0, // isRead (false)
        );
      }

      const bulkInsertNotificationQuery = `
        INSERT INTO notifications 
          (recipient, sender, postId, commentId, postContentSnippet, type, language, isRead)
        VALUES ${notificationValues.join(", ")}
      `;

      await db.execute(bulkInsertNotificationQuery, notificationParams);
    }

    // 5. Return new comment enriched with user details
    return res.status(201).json({
      id: commentId,
      _id: commentId,
      postId,
      userId: {
        _id: String(userId),
        username: username.trim(),
        profileImage,
      },
      content: content.trim(),
      parentId: cleanParentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error submitting comment:", error);
    return res.status(500).json({
      success: false,
      message: "Error submitting comment",
      error: error.message,
    });
  }
});

// app.get("/api/comments/post/:postId", async (req, res) => {
//   try {
//     const { postId } = req.params;

//     // 1. Fetch parent post to get language context
//     const post = await Post.findById(postId).lean();
//     if (!post) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found." });
//     }

//     // 2. Aggregate comments and attach matching language profileImage
//     const postComments = await Comment.aggregate([
//       {
//         $match: {
//           postId: new mongoose.Types.ObjectId(postId),
//         },
//       },
//       // Join User details
//       {
//         $lookup: {
//           from: "register",
//           let: { commentUserId: "$userId" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [
//                     { $toString: "$_id" },
//                     { $toString: "$$commentUserId" },
//                   ],
//                 },
//               },
//             },
//           ],
//           as: "author",
//         },
//       },
//       {
//         $unwind: {
//           path: "$author",
//           preserveNullAndEmptyArrays: true,
//         },
//       },
//       // Join PersonalDetails matching user ID AND post language
//       {
//         $lookup: {
//           from: "personaldetails",
//           let: {
//             authorId: "$author._id",
//             targetLang: post.language,
//           },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $and: [
//                     {
//                       $eq: [
//                         { $toString: "$userId" },
//                         { $toString: "$$authorId" },
//                       ],
//                     },
//                     { $eq: ["$language", "$$targetLang"] },
//                   ],
//                 },
//               },
//             },
//           ],
//           as: "authorProfile",
//         },
//       },
//       // Shape comment output structure
//       {
//         $project: {
//           _id: 1,
//           postId: 1,
//           content: 1,
//           parentId: 1,
//           createdAt: 1,
//           userId: {
//             _id: "$author._id",
//             username: { $ifNull: ["$author.username", "$username"] },
//             profileImage: {
//               $ifNull: [
//                 { $arrayElemAt: ["$authorProfile.profileImage", 0] },
//                 "",
//               ],
//             },
//           },
//         },
//       },
//       { $sort: { createdAt: 1 } },
//     ]);

//     // 3. Organize into parent comments and nested replies
//     const totalCount = postComments.length;
//     const parentComments = [];
//     const repliesMap = {};

//     postComments.forEach((c) => {
//       if (!c.parentId) {
//         parentComments.push({ ...c, replies: [] });
//       } else {
//         const pId = c.parentId.toString();
//         if (!repliesMap[pId]) repliesMap[pId] = [];
//         repliesMap[pId].push(c);
//       }
//     });

//     const structuredComments = parentComments.map((parent) => ({
//       ...parent,
//       replies: repliesMap[parent._id.toString()] || [],
//     }));

//     return res.status(200).json({
//       success: true,
//       totalCount,
//       comments: structuredComments,
//     });
//   } catch (error) {
//     return res
//       .status(500)
//       .json({ message: "Error fetching comments", error: error.message });
//   }
// });

// ----------------------------------------------------
// Increments post views
// ----------------------------------------------------

// sql
app.get("/api/comments/post/:postId", async (req, res) => {
  try {
    const { postId } = req.params;

    // 1. Fetch parent post to check existence and language context
    const [posts] = await db.execute(
      "SELECT id, language FROM posts WHERE id = ?",
      [postId],
    );

    if (!posts || posts.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found." });
    }

    const postLanguage = posts[0].language || "English";

    // 2. Fetch comments joined with user details and language-matched profile details
    const query = `
      SELECT 
        c.id AS _id,
        c.postId,
        c.content,
        c.parentId,
        c.created_at AS createdAt,
        c.userId AS authorId,
        COALESCE(u.username, c.username) AS username,
        COALESCE(pd.profileImage, '') AS profileImage
      FROM comments c
      LEFT JOIN register u ON c.userId = u.id
      LEFT JOIN personaldetails pd ON c.userId = pd.userId AND pd.language = ?
      WHERE c.postId = ?
      ORDER BY c.created_at ASC
    `;

    const [rows] = await db.execute(query, [postLanguage, postId]);

    // 3. Format row data and organize into parent comments and nested replies
    const parentComments = [];
    const repliesMap = {};

    rows.forEach((row) => {
      const formattedComment = {
        _id: row._id,
        postId: row.postId,
        content: row.content,
        parentId: row.parentId,
        createdAt: row.createdAt,
        userId: {
          _id: String(row.authorId),
          username: row.username || "",
          profileImage: row.profileImage || "",
        },
      };

      if (!row.parentId) {
        parentComments.push({ ...formattedComment, replies: [] });
      } else {
        const pId = String(row.parentId);
        if (!repliesMap[pId]) repliesMap[pId] = [];
        repliesMap[pId].push(formattedComment);
      }
    });

    const structuredComments = parentComments.map((parent) => ({
      ...parent,
      replies: repliesMap[String(parent._id)] || [],
    }));

    return res.status(200).json({
      success: true,
      totalCount: rows.length,
      comments: structuredComments,
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return res
      .status(500)
      .json({ message: "Error fetching comments", error: error.message });
  }
});

// app.patch("/api/posts/:postId/view", async (req, res) => {
//   try {
//     const { postId } = req.params;

//     // Atomically increment view count by 1
//     const updatedPost = await Post.findByIdAndUpdate(
//       postId,
//       { $inc: { views: 1 } },
//       // { new: true },
//       { returnDocument: "after" },
//     );

//     if (!updatedPost) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found" });
//     }

//     return res.status(200).json({
//       success: true,
//       views: updatedPost.views,
//     });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// sql
app.patch("/api/posts/:postId/view", async (req, res) => {
  try {
    const { postId } = req.params;

    // 1. Atomically increment the view count by 1
    const [updateResult] = await db.execute(
      "UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = ?",
      [postId],
    );

    if (updateResult.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // 2. Fetch the updated view count
    const [rows] = await db.execute("SELECT views FROM posts WHERE id = ?", [
      postId,
    ]);

    return res.status(200).json({
      success: true,
      views: rows[0].views,
    });
  } catch (error) {
    console.error("Error updating post views:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ----------------------------------------------------
// Toggles likes for a post by a given user
// ----------------------------------------------------
// app.patch("/api/posts/:postId/like", async (req, res) => {
//   try {
//     const { postId } = req.params;
//     const { userId } = req.body; // Logged-in user's ID

//     if (!userId) {
//       return res
//         .status(400)
//         .json({ success: false, message: "userId is required" });
//     }

//     const post = await Post.findById(postId);
//     if (!post) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found" });
//     }

//     // Check if the user has already liked this post
//     const hasLiked = post.likes.includes(userId);

//     let updatedPost;
//     if (hasLiked) {
//       // Remove user ID and decrement like count
//       updatedPost = await Post.findByIdAndUpdate(
//         postId,
//         {
//           $pull: { likes: userId },
//           $inc: { likeCount: -1 },
//         },
//         // { new: true },
//         { returnDocument: "after" },
//       );
//     } else {
//       // Add user ID and increment like count
//       updatedPost = await Post.findByIdAndUpdate(
//         postId,
//         {
//           $addToSet: { likes: userId },
//           $inc: { likeCount: 1 },
//         },
//         // { new: true },
//         { returnDocument: "after" },
//       );
//     }

//     return res.status(200).json({
//       success: true,
//       liked: !hasLiked,
//       likeCount: updatedPost.likeCount,
//       likes: updatedPost.likes,
//     });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// sql
app.patch("/api/posts/:postId/like", async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body; // Logged-in user's ID

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });
    }

    // 1. Fetch current post likes array and count
    const [posts] = await db.execute(
      "SELECT id, COALESCE(likes, '[]') AS likes, COALESCE(likeCount, 0) AS likeCount FROM posts WHERE id = ?",
      [postId],
    );

    if (!posts || posts.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    let likesArray = posts[0].likes;
    if (typeof likesArray === "string") {
      try {
        likesArray = JSON.parse(likesArray);
      } catch {
        likesArray = [];
      }
    }

    // Convert all elements to strings to make exact comparison safe
    const targetUserIdStr = String(userId);
    const hasLiked = likesArray.some((id) => String(id) === targetUserIdStr);

    let updatedLikes = [];
    let updatedLikeCount = 0;

    if (hasLiked) {
      // Remove user ID and decrement likeCount
      updatedLikes = likesArray.filter((id) => String(id) !== targetUserIdStr);
      updatedLikeCount = Math.max(0, Number(posts[0].likeCount) - 1);
    } else {
      // Add user ID and increment likeCount
      updatedLikes = [...likesArray, targetUserIdStr];
      updatedLikeCount = Number(posts[0].likeCount) + 1;
    }

    // 2. Save updated JSON array and count back to the table
    await db.execute("UPDATE posts SET likes = ?, likeCount = ? WHERE id = ?", [
      JSON.stringify(updatedLikes),
      updatedLikeCount,
      postId,
    ]);

    return res.status(200).json({
      success: true,
      liked: !hasLiked,
      likeCount: updatedLikeCount,
      likes: updatedLikes,
    });
  } catch (error) {
    console.error("Error toggling post like:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET: Filter courses by language & courseType enrollment
app.get("/api/courses", async (req, res) => {
  try {
    const { courseType, role, language } = req.query;
    const formattedLang = language;

    const filterQuery = {};

    if (formattedLang) {
      filterQuery.language = formattedLang;
    }

    // Filter for non-admin students based on their enrolled courseType
    if (role !== "admin") {
      if (!courseType) {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
        });
      }

      filterQuery.title = courseType.trim();
    }

    const courses = await Course.find(filterQuery).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching courses",
    });
  }
});

// POST: Admin create course
// app.post("/api/courses", upload.single("thumbnail"), async (req, res) => {
//   try {
//     const { title, description, instructor, isPaid, isNewCourse, language } =
//       req.body;

//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: "Thumbnail image file is required.",
//       });
//     }

//     if (!title) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid title. Must be 'Face Yoga' or 'Face Yoga + Raj Yoga'.",
//       });
//     }

//     const formattedLang = language;
//     if (!formattedLang) {
//       return res.status(400).json({
//         success: false,
//         message: "Valid language ('English' or 'Telugu') is required.",
//       });
//     }

//     const thumbnailUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

//     const newCourse = new Course({
//       title: title.trim(),
//       description,
//       instructor: instructor || "Pooja Agarwala",
//       thumbnail: thumbnailUrl,
//       isPaid: isPaid === "true" || isPaid === true,
//       isNewCourse: isNewCourse === "true" || isNewCourse === true,
//       language: formattedLang,
//       progress: 0,
//       status: "not_started",
//     });

//     const savedCourse = await newCourse.save();

//     return res.status(201).json({
//       success: true,
//       message: "Course created successfully",
//       data: savedCourse,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Server error while creating course",
//     });
//   }
// });

app.post("/api/courses", async (req, res) => {
  try {
    const {
      title,
      description,
      instructor,
      thumbnail,
      isPaid,
      isNewCourse,
      language,
    } = req.body;

    if (!thumbnail || typeof thumbnail !== "string" || !thumbnail.trim()) {
      return res.status(400).json({
        success: false,
        message: "Thumbnail URL is required.",
      });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Course title is required.",
      });
    }

    const formattedLang = language;
    if (!formattedLang) {
      return res.status(400).json({
        success: false,
        message: "Valid language ('English' or 'Telugu') is required.",
      });
    }

    const newCourse = new Course({
      title: title.trim(),
      description,
      instructor: instructor || "Pooja Agarwala",
      thumbnail: thumbnail.trim(),
      isPaid: isPaid === "true" || isPaid === true,
      isNewCourse: isNewCourse === "true" || isNewCourse === true,
      language: formattedLang,
      progress: 0,
      status: "not_started",
    });

    const savedCourse = await newCourse.save();

    return res.status(201).json({
      success: true,
      message: "Course created successfully",
      data: savedCourse,
    });
  } catch (error) {
    console.error("Error creating course:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while creating course",
    });
  }
});

// PUT: Admin update course
// app.put("/api/courses/:id", upload.single("thumbnail"), async (req, res) => {
//   try {
//     const course = await Course.findById(req.params.id);

//     if (!course) {
//       return res.status(404).json({
//         success: false,
//         message: "Course not found",
//       });
//     }

//     if (req.body.title !== undefined) course.title = req.body.title;
//     if (req.body.description !== undefined)
//       course.description = req.body.description;
//     if (req.body.instructor !== undefined)
//       course.instructor = req.body.instructor;
//     if (req.body.status !== undefined) course.status = req.body.status;
//     if (req.body.progress !== undefined)
//       course.progress = Number(req.body.progress);

//     if (req.body.language !== undefined) {
//       course.language = req.body.language;
//     }

//     if (req.body.isPaid !== undefined) {
//       course.isPaid = req.body.isPaid === "true" || req.body.isPaid === true;
//     }
//     if (req.body.isNewCourse !== undefined) {
//       course.isNewCourse =
//         req.body.isNewCourse === "true" || req.body.isNewCourse === true;
//     }

//     if (req.file) {
//       if (course.thumbnail) {
//         const oldFileName = course.thumbnail.split("/uploads/").pop();
//         if (oldFileName) {
//           const oldFilePath = path.join(process.cwd(), "uploads", oldFileName);
//           if (fs.existsSync(oldFilePath)) {
//             fs.unlinkSync(oldFilePath);
//           }
//         }
//       }
//       course.thumbnail = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
//     }

//     const updatedCourse = await course.save();

//     return res.status(200).json({
//       success: true,
//       message: "Course updated successfully",
//       data: updatedCourse,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Server error while updating course",
//     });
//   }
// });

app.put("/api/courses/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Update string and numeric fields if provided
    if (req.body.title !== undefined) course.title = req.body.title.trim();
    if (req.body.description !== undefined)
      course.description = req.body.description;
    if (req.body.instructor !== undefined)
      course.instructor = req.body.instructor;
    if (req.body.status !== undefined) course.status = req.body.status;
    if (req.body.progress !== undefined)
      course.progress = Number(req.body.progress);
    if (req.body.language !== undefined) course.language = req.body.language;

    // Handle boolean flags
    if (req.body.isPaid !== undefined) {
      course.isPaid = req.body.isPaid === "true" || req.body.isPaid === true;
    }
    if (req.body.isNewCourse !== undefined) {
      course.isNewCourse =
        req.body.isNewCourse === "true" || req.body.isNewCourse === true;
    }

    // Clean up old S3 file if a new thumbnail URL is provided and differs from existing
    if (req.body.thumbnail && req.body.thumbnail !== course.thumbnail) {
      if (course.thumbnail) {
        const oldS3Key = getS3KeyFromUrl(course.thumbnail);
        if (oldS3Key) {
          try {
            await s3.send(
              new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME || bucketName,
                Key: oldS3Key,
              }),
            );
            console.log(`Deleted old thumbnail S3 key: ${oldS3Key}`);
          } catch (s3Err) {
            console.error(`Failed to delete old S3 key (${oldS3Key}):`, s3Err);
          }
        }
      }
      course.thumbnail = req.body.thumbnail.trim();
    }

    const updatedCourse = await course.save();

    return res.status(200).json({
      success: true,
      message: "Course updated successfully",
      data: updatedCourse,
    });
  } catch (error) {
    console.error("Error updating course:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while updating course",
    });
  }
});

// DELETE: Admin remove a course and its thumbnail image
// app.delete("/api/courses/:id", async (req, res) => {
//   try {
//     const course = await Course.findById(req.params.id);

//     if (!course) {
//       return res.status(404).json({
//         success: false,
//         message: "Course not found.",
//       });
//     }

//     // 1. Delete thumbnail file from disk storage if present
//     if (course.thumbnail) {
//       const fileName = course.thumbnail.split("/uploads/").pop();
//       if (fileName) {
//         const filePath = path.join(process.cwd(), "uploads", fileName);
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       }
//     }

//     // 2. Remove document from MongoDB
//     await Course.findByIdAndDelete(req.params.id);

//     return res.status(200).json({
//       success: true,
//       message: "Course and thumbnail deleted successfully.",
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Server error while deleting course.",
//     });
//   }
// });

app.delete("/api/courses/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    // 1. Delete thumbnail file from disk storage if present
    if (course.thumbnail) {
      const fileName = course.thumbnail.split("/uploads/").pop();
      if (fileName) {
        const filePath = path.join(process.cwd(), "uploads", fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    // 2. Remove document from MongoDB
    await Course.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Course and thumbnail deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while deleting course.",
    });
  }
});

// app.get("/api`/notifications", async (req, res) => {
//   try {
//     const { userId } = req.query;

//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "userId query parameter is required.",
//       });
//     }

//     // Fetch all notifications for the recipient sorted by newest first
//     const notifications = await Notification.find({ recipient: userId })
//       .populate("sender", "username courseType role")
//       .populate("postId", "content mediaFiles courseType language")
//       .sort({ createdAt: -1 });

//     // Optional: Filter by route language for admins if `lang` parameter is provided
//     if (language && user && user.role === "admin") {
//       const targetLang = language === "Telugu" ? "Telugu" : "English";
//       notifications = notifications.filter(
//         (n) => !n.postId || n.postId.language === targetLang,
//       );
//     }

//     return res.status(200).json({
//       success: true,
//       count: notifications.length,
//       data: notifications,
//     });
//   } catch (error) {
//     console.error("Error fetching notifications:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });

// app.get("/api/notifications", async (req, res) => {
//   try {
//     const { userId, language } = req.query;

//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "userId query parameter is required.",
//       });
//     }

//     // 1. Fetch user to check role
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found.",
//       });
//     }

//     // 2. Query notifications for the user
//     let notifications = await Notification.find({ recipient: userId })
//       .populate("sender", "username courseType role")
//       .populate("postId", "content mediaFiles courseType language")
//       .sort({ createdAt: -1 });

//     // 3. Filter by language ONLY if the user is NOT an admin
//     if (user.role !== "admin" && language) {
//       const targetLang =
//         language.toLowerCase() === "telugu" || language === "te"
//           ? "Telugu"
//           : "English";

//       notifications = notifications.filter(
//         (n) => !n.postId || n.postId.language === targetLang,
//       );
//     }

//     return res.status(200).json({
//       success: true,
//       count: notifications.length,
//       data: notifications,
//     });
//   } catch (error) {
//     console.error("Error fetching notifications:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });

// app.get("/api/notifications", async (req, res) => {
//   try {
//     const { userId, language } = req.query;

//     const parsedUserId = parseInt(userId, 10);
//     if (!userId || isNaN(parsedUserId) || parsedUserId <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: "userId query parameter is required and must be a valid ID.",
//       });
//     }

//     // 1. Fetch user to check role
//     const [userRows] = await db.execute(
//       `SELECT id, role FROM register WHERE id = ?`,
//       [parsedUserId],
//     );

//     if (userRows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found.",
//       });
//     }

//     const user = userRows[0];

//     // Format target language if provided
//     let targetLang = null;
//     if (language) {
//       const lower = language.toLowerCase();
//       if (lower === "telugu" || lower === "te") targetLang = "Telugu";
//       if (lower === "english" || lower === "en") targetLang = "English";
//     }

//     // 2. Fetch notifications with Sender (register) and Post (adminposts) details
//     let query = `
//       SELECT
//         n.id AS _id,
//         n.recipientId AS recipient,
//         n.senderId,
//         n.postId,
//         n.type,
//         n.isRead,
//         n.created_at AS createdAt,
//         n.updated_at AS updatedAt,
//         -- Sender details
//         sr.id AS sender_id,
//         sr.username AS sender_username,
//         sr.courseType AS sender_courseType,
//         sr.role AS sender_role,
//         -- Post details
//         ap.id AS post_id,
//         ap.content AS post_content,
//         ap.mediaFiles AS post_mediaFiles,
//         ap.courseType AS post_courseType,
//         ap.language AS post_language
//       FROM notifications n
//       LEFT JOIN register sr ON n.senderId = sr.id
//       LEFT JOIN adminposts ap ON n.postId = ap.id
//       WHERE n.recipientId = ?
//     `;

//     const queryParams = [parsedUserId];

//     // 3. Filter by language directly in SQL if user is NOT an admin
//     if (user.role !== "admin" && targetLang) {
//       query += ` AND (n.postId IS NULL OR ap.language = ?)`;
//       queryParams.push(targetLang);
//     }

//     query += ` ORDER BY n.created_at DESC`;

//     const [rows] = await db.execute(query, queryParams);

//     // 4. Format objects to match populated Mongoose output structure
//     const notifications = rows.map((n) => {
//       let mediaFiles = n.post_mediaFiles;
//       let postCourseType = n.post_courseType;

//       if (typeof mediaFiles === "string")
//         mediaFiles = JSON.parse(mediaFiles || "[]");
//       if (typeof postCourseType === "string")
//         postCourseType = JSON.parse(postCourseType || "[]");

//       return {
//         _id: n._id,
//         recipient: n.recipient,
//         type: n.type,
//         isRead: Boolean(n.isRead),
//         sender: n.senderId
//           ? {
//               _id: n.sender_id,
//               username: n.sender_username || "",
//               courseType: n.sender_courseType || "",
//               role: n.sender_role || "",
//             }
//           : null,
//         postId: n.postId
//           ? {
//               _id: n.post_id,
//               content: n.post_content || "",
//               mediaFiles: mediaFiles || [],
//               courseType: postCourseType || [],
//               language: n.post_language || "",
//             }
//           : null,
//         createdAt: n.createdAt,
//         updatedAt: n.updatedAt,
//       };
//     });

//     return res.status(200).json({
//       success: true,
//       count: notifications.length,
//       data: notifications,
//     });
//   } catch (error) {
//     console.error("Error fetching notifications:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });

app.get("/api/notifications", async (req, res) => {
  try {
    const { userId, language } = req.query;

    const parsedUserId = parseInt(userId, 10);
    if (!userId || isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: "userId query parameter is required and must be a valid ID.",
      });
    }

    // 1. Fetch user to check role
    const [userRows] = await db.execute(
      `SELECT id, role FROM register WHERE id = ?`,
      [parsedUserId],
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = userRows[0];

    // Format target language if provided
    let targetLang = null;
    if (language) {
      const lower = language.toLowerCase();
      if (lower === "telugu" || lower === "te") targetLang = "Telugu";
      if (lower === "english" || lower === "en") targetLang = "English";
    }

    // 2. Fetch notifications with Sender (register) and Post (adminposts) details
    // REMOVED n.updated_at FROM SELECT
    let query = `
      SELECT 
        n.id AS _id,
        n.recipientId AS recipient,
        n.senderId,
        n.postId,
        n.type,
        n.isRead,
        n.created_at AS createdAt,
        -- Sender details
        sr.id AS sender_id,
        sr.username AS sender_username,
        sr.courseType AS sender_courseType,
        sr.role AS sender_role,
        -- Post details
        ap.id AS post_id,
        ap.content AS post_content,
        ap.mediaFiles AS post_mediaFiles,
        ap.courseType AS post_courseType,
        ap.language AS post_language
      FROM notifications n
      LEFT JOIN register sr ON n.senderId = sr.id
      LEFT JOIN adminposts ap ON n.postId = ap.id
      WHERE n.recipientId = ?
    `;

    const queryParams = [parsedUserId];

    // 3. Filter by language directly in SQL if user is NOT an admin
    if (user.role !== "admin" && targetLang) {
      query += ` AND (n.postId IS NULL OR ap.language = ?)`;
      queryParams.push(targetLang);
    }

    query += ` ORDER BY n.created_at DESC`;

    const [rows] = await db.execute(query, queryParams);

    // 4. Format objects to match populated Mongoose output structure
    const notifications = rows.map((n) => {
      let mediaFiles = n.post_mediaFiles;
      let postCourseType = n.post_courseType;

      if (typeof mediaFiles === "string")
        mediaFiles = JSON.parse(mediaFiles || "[]");
      if (typeof postCourseType === "string")
        postCourseType = JSON.parse(postCourseType || "[]");

      return {
        _id: n._id,
        recipient: n.recipient,
        type: n.type,
        isRead: Boolean(n.isRead),
        sender: n.senderId
          ? {
              _id: n.sender_id,
              username: n.sender_username || "",
              courseType: n.sender_courseType || "",
              role: n.sender_role || "",
            }
          : null,
        postId: n.postId
          ? {
              _id: n.post_id,
              content: n.post_content || "",
              mediaFiles: mediaFiles || [],
              courseType: postCourseType || [],
              language: n.post_language || "",
            }
          : null,
        createdAt: n.createdAt,
        updatedAt: n.createdAt, // Fallback to createdAt if updated_at is absent
      };
    });

    return res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});
/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark a specific notification as read
 * @access  Private
 */
// app.patch("/api/notifications/:id/read", async (req, res) => {
//   try {
//     const { id } = req.params;

//     const notification = await Notification.findByIdAndUpdate(
//       id,
//       { isRead: true },
//       { new: true },
//     );

//     if (!notification) {
//       return res.status(404).json({
//         success: false,
//         message: "Notification not found.",
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Notification marked as read.",
//       data: notification,
//     });
//   } catch (error) {
//     console.error("Error updating notification:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });

app.patch("/api/notifications/:id/read", async (req, res) => {
  try {
    const { id } = req.params;

    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId) || parsedId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID format",
      });
    }

    // 1. Update the notification's read status
    const [updateResult] = await db.execute(
      `UPDATE notifications 
       SET isRead = 1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [parsedId],
    );

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    // 2. Fetch the updated notification record to match Mongoose { new: true } response
    const [rows] = await db.execute(
      `SELECT 
        id AS _id,
        recipientId AS recipient,
        senderId,
        postId,
        type,
        isRead,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM notifications 
       WHERE id = ?`,
      [parsedId],
    );

    const notification = {
      ...rows[0],
      isRead: Boolean(rows[0].isRead),
    };

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      data: notification,
    });
  } catch (error) {
    console.error("Error updating notification:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

/**
 * Helper utility to extract S3 Object Key from a Full S3 URL
 */
const getS3KeyFromUrl = (fileUrl) => {
  try {
    const parsedUrl = new URL(fileUrl);
    // Remove leading slash to get the S3 key
    return decodeURIComponent(parsedUrl.pathname.substring(1));
  } catch (error) {
    console.error("Error parsing S3 URL:", error);
    return null;
  }
};

// app.put("/api/posts/:id", async (req, res) => {
//   try {
//     const {
//       userId,
//       content,
//       tagIds,
//       fileLink,
//       fileLinks,
//       targetLanguage,
//       removedMediaIds,
//     } = req.body;

//     // 1. Fetch post to update
//     const post = await Post.findById(req.params.id);
//     if (!post) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found" });
//     }

//     // 2. Fetch editor user details
//     const author = await User.findById(userId);
//     if (!author) {
//       return res.status(404).json({
//         success: false,
//         message: "User making the edit not found in database.",
//       });
//     }

//     // 3. Authorization check
//     const isOwner = post.userId
//       ? post.userId.toString() === author._id.toString()
//       : false;
//     const isAdmin = author.role === "admin";

//     if (!isOwner && !isAdmin) {
//       return res
//         .status(403)
//         .json({ success: false, message: "Unauthorized action" });
//     }

//     // 4. Update text content & language preferences
//     if (content !== undefined) post.content = content;

//     if (isAdmin && targetLanguage) {
//       post.language = targetLanguage;
//     } else if (author.language) {
//       post.language = author.language;
//     }

//     if (tagIds !== undefined) {
//       try {
//         post.tagIds = typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
//       } catch (e) {
//         post.tagIds = [];
//       }
//     }

//     // 5. Remove media files from AWS S3 Bucket & MongoDB array
//     if (removedMediaIds) {
//       let idsToDelete = [];
//       try {
//         idsToDelete =
//           typeof removedMediaIds === "string"
//             ? JSON.parse(removedMediaIds)
//             : removedMediaIds;
//       } catch (e) {
//         idsToDelete = Array.isArray(removedMediaIds)
//           ? removedMediaIds
//           : [removedMediaIds];
//       }

//       // Convert String IDs to string format for comparison
//       const formattedIds = idsToDelete.map((id) => id.toString());

//       // Filter and delete removed files from AWS S3
//       const updatedMediaFiles = [];
//       for (const file of post.mediaFiles) {
//         if (formattedIds.includes(file._id.toString())) {
//           // Delete file from AWS S3 bucket
//           const s3Key = getS3KeyFromUrl(file.fileLink);
//           if (s3Key) {
//             try {
//               await s3.send(
//                 new DeleteObjectCommand({
//                   Bucket: process.env.AWS_BUCKET_NAME,
//                   Key: s3Key,
//                 }),
//               );
//               console.log(`Successfully deleted S3 key: ${s3Key}`);
//             } catch (s3Err) {
//               console.error(`Failed to delete S3 key (${s3Key}):`, s3Err);
//             }
//           }
//         } else {
//           updatedMediaFiles.push(file);
//         }
//       }

//       post.mediaFiles = updatedMediaFiles;
//     }

//     // 6. Append new S3 media URLs if provided
//     const rawLinks = fileLinks
//       ? Array.isArray(fileLinks)
//         ? fileLinks
//         : [fileLinks]
//       : fileLink
//         ? [fileLink]
//         : [];

//     const newUploadedMedia = rawLinks
//       .filter((link) => typeof link === "string" && link.trim() !== "")
//       .map((link) => ({
//         fileLink: link.trim(),
//         mediaType: getMediaTypeFromUrl(link),
//       }));

//     if (newUploadedMedia.length > 0) {
//       post.mediaFiles.push(...newUploadedMedia);
//     }

//     const updatedPost = await post.save();

//     return res.status(200).json({
//       success: true,
//       message: "Post updated successfully",
//       data: updatedPost,
//     });
//   } catch (error) {
//     console.error("Error updating post:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });

// sql
// app.put("/api/posts/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const {
//       userId,
//       content,
//       tagIds,
//       fileLink,
//       fileLinks,
//       targetLanguage,
//       removedMediaIds,
//     } = req.body;

//     // 1. Fetch post to update
//     const [posts] = await db.execute(
//       "SELECT id, userId, content, language, tagIds, mediaFiles FROM posts WHERE id = ?",
//       [id],
//     );

//     if (!posts || posts.length === 0) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found" });
//     }

//     const post = posts[0];

//     // 2. Fetch editor user details
//     const [users] = await db.execute(
//       "SELECT id, role, language FROM register WHERE id = ?",
//       [userId],
//     );

//     if (!users || users.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "User making the edit not found in database.",
//       });
//     }

//     const author = users[0];

//     // 3. Authorization check
//     const isOwner = post.userId
//       ? String(post.userId) === String(author.id)
//       : false;
//     const isAdmin =
//       String(author.role || "")
//         .toLowerCase()
//         .trim() === "admin";

//     if (!isOwner && !isAdmin) {
//       return res
//         .status(403)
//         .json({ success: false, message: "Unauthorized action" });
//     }

//     // Parse existing JSON structures from MySQL
//     let currentTagIds = [];
//     try {
//       currentTagIds =
//         typeof post.tagIds === "string"
//           ? JSON.parse(post.tagIds || "[]")
//           : post.tagIds || [];
//     } catch {
//       currentTagIds = [];
//     }

//     let currentMediaFiles = [];
//     try {
//       currentMediaFiles =
//         typeof post.mediaFiles === "string"
//           ? JSON.parse(post.mediaFiles || "[]")
//           : post.mediaFiles || [];
//     } catch {
//       currentMediaFiles = [];
//     }

//     // 4. Update text content & language preferences
//     let updatedContent = content !== undefined ? content : post.content;
//     let updatedLanguage = post.language;

//     if (isAdmin && targetLanguage) {
//       updatedLanguage = targetLanguage;
//     } else if (author.language) {
//       updatedLanguage = author.language;
//     }

//     if (tagIds !== undefined) {
//       try {
//         currentTagIds =
//           typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
//       } catch {
//         currentTagIds = [];
//       }
//     }

//     // 5. Remove media files from AWS S3 Bucket & JSON array
//     if (removedMediaIds) {
//       let idsToDelete = [];
//       try {
//         idsToDelete =
//           typeof removedMediaIds === "string"
//             ? JSON.parse(removedMediaIds)
//             : removedMediaIds;
//       } catch {
//         idsToDelete = Array.isArray(removedMediaIds)
//           ? removedMediaIds
//           : [removedMediaIds];
//       }

//       const formattedIds = (
//         Array.isArray(idsToDelete) ? idsToDelete : [idsToDelete]
//       ).map((mId) => String(mId));

//       const updatedMediaFiles = [];
//       for (const file of currentMediaFiles) {
//         // Match by file.id, file._id, or index fallback string
//         const fileIdStr = String(file._id || file.id || "");

//         if (formattedIds.includes(fileIdStr)) {
//           // Delete file from AWS S3 bucket
//           const s3Key = getS3KeyFromUrl(file.fileLink);
//           if (s3Key) {
//             try {
//               await s3.send(
//                 new DeleteObjectCommand({
//                   Bucket: process.env.AWS_BUCKET_NAME,
//                   Key: s3Key,
//                 }),
//               );
//               console.log(`Successfully deleted S3 key: ${s3Key}`);
//             } catch (s3Err) {
//               console.error(`Failed to delete S3 key (${s3Key}):`, s3Err);
//             }
//           }
//         } else {
//           updatedMediaFiles.push(file);
//         }
//       }

//       currentMediaFiles = updatedMediaFiles;
//     }

//     // 6. Append new S3 media URLs if provided
//     const rawLinks = fileLinks
//       ? Array.isArray(fileLinks)
//         ? fileLinks
//         : [fileLinks]
//       : fileLink
//         ? [fileLink]
//         : [];

//     const newUploadedMedia = rawLinks
//       .filter((link) => typeof link === "string" && link.trim() !== "")
//       .map((link, idx) => ({
//         id: Date.now() + idx, // Generate unique numeric ID for MySQL array elements
//         _id: String(Date.now() + idx),
//         fileLink: link.trim(),
//         mediaType: getMediaTypeFromUrl(link),
//       }));

//     if (newUploadedMedia.length > 0) {
//       currentMediaFiles.push(...newUploadedMedia);
//     }

//     // 7. Execute UPDATE in MySQL
//     await db.execute(
//       `UPDATE posts
//        SET content = ?, language = ?, tagIds = ?, mediaFiles = ?, updated_at = CURRENT_TIMESTAMP
//        WHERE id = ?`,
//       [
//         updatedContent,
//         updatedLanguage,
//         JSON.stringify(currentTagIds),
//         JSON.stringify(currentMediaFiles),
//         id,
//       ],
//     );

//     // 8. Fetch and return updated post record
//     const [updatedRows] = await db.execute("SELECT * FROM posts WHERE id = ?", [
//       id,
//     ]);

//     return res.status(200).json({
//       success: true,
//       message: "Post updated successfully",
//       data: {
//         ...updatedRows[0],
//         tagIds: currentTagIds,
//         mediaFiles: currentMediaFiles,
//       },
//     });
//   } catch (error) {
//     console.error("Error updating post:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });

// sql
app.put("/api/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      userId,
      content,
      tagIds,
      fileLink,
      fileLinks,
      targetLanguage,
      removedMediaIds,
    } = req.body;

    // 1. Fetch post to update from MySQL
    const [posts] = await db.execute(
      "SELECT id, userId, content, language, tagIds, mediaFiles FROM posts WHERE id = ?",
      [id],
    );

    if (!posts || posts.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    const post = posts[0];

    // 2. Fetch editor user details
    const [users] = await db.execute(
      "SELECT id, role, language FROM register WHERE id = ?",
      [userId],
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User making the edit not found in database.",
      });
    }

    const author = users[0];

    // 3. Authorization check
    const isOwner = post.userId
      ? String(post.userId) === String(author.id)
      : false;
    const isAdmin =
      String(author.role || "")
        .toLowerCase()
        .trim() === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });
    }

    // Parse existing JSON structures stored in MySQL
    let currentTagIds = [];
    try {
      currentTagIds =
        typeof post.tagIds === "string"
          ? JSON.parse(post.tagIds || "[]")
          : post.tagIds || [];
    } catch {
      currentTagIds = [];
    }

    let currentMediaFiles = [];
    try {
      currentMediaFiles =
        typeof post.mediaFiles === "string"
          ? JSON.parse(post.mediaFiles || "[]")
          : post.mediaFiles || [];
    } catch {
      currentMediaFiles = [];
    }

    // 4. Update text content & language preferences
    let updatedContent = content !== undefined ? content : post.content;
    let updatedLanguage = post.language;

    if (isAdmin && targetLanguage) {
      updatedLanguage = targetLanguage;
    } else if (author.language) {
      updatedLanguage = author.language;
    }

    if (tagIds !== undefined) {
      try {
        currentTagIds =
          typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
      } catch {
        currentTagIds = [];
      }
    }

    // 5. Detect media removal request from frontend payload
    let isRemovalRequested = false;

    if (removedMediaIds) {
      let parsedRemoved = [];
      try {
        parsedRemoved =
          typeof removedMediaIds === "string"
            ? JSON.parse(removedMediaIds)
            : removedMediaIds;
      } catch {
        parsedRemoved = [removedMediaIds];
      }

      // Check if removedMediaIds array contains null, undefined, or "null" string
      if (Array.isArray(parsedRemoved)) {
        isRemovalRequested = parsedRemoved.some(
          (val) => val === null || val === undefined || val === "null",
        );
      }
    }

    // Also trigger removal if fileLink is explicitly passed as empty string or null
    if (fileLink === "" || fileLink === null) {
      isRemovalRequested = true;
    }

    const updatedMediaFiles = [];

    // Process existing media files stored in MySQL
    for (const file of currentMediaFiles) {
      const currentUrl = String(file.fileLink || file.url || "").trim();

      if (isRemovalRequested) {
        // Delete file from AWS S3
        const s3Key = getS3KeyFromUrl(currentUrl);
        if (s3Key) {
          try {
            await s3.send(
              new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: s3Key,
              }),
            );
            console.log(`Successfully deleted S3 key: ${s3Key}`);
          } catch (s3Err) {
            console.error(`Failed to delete S3 key (${s3Key}):`, s3Err);
          }
        }
        // Excluded from updatedMediaFiles (removes from MySQL JSON array)
      } else {
        // Keep file if no removal was requested
        updatedMediaFiles.push(file);
      }
    }

    currentMediaFiles = updatedMediaFiles;

    // 6. Append new S3 media URLs if provided as non-empty strings
    const rawLinks = fileLinks
      ? Array.isArray(fileLinks)
        ? fileLinks
        : [fileLinks]
      : fileLink
        ? [fileLink]
        : [];

    const newUploadedMedia = rawLinks
      .filter((link) => typeof link === "string" && link.trim() !== "")
      .map((link, idx) => ({
        id: Date.now() + idx,
        _id: String(Date.now() + idx),
        fileLink: link.trim(),
        mediaType: getMediaTypeFromUrl(link.trim()),
      }));

    if (newUploadedMedia.length > 0) {
      currentMediaFiles.push(...newUploadedMedia);
    }

    // 7. Execute UPDATE in MySQL
    await db.execute(
      `UPDATE posts 
       SET content = ?, language = ?, tagIds = ?, mediaFiles = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        updatedContent,
        updatedLanguage,
        JSON.stringify(currentTagIds),
        JSON.stringify(currentMediaFiles),
        id,
      ],
    );

    // 8. Fetch and return updated post record
    const [updatedRows] = await db.execute("SELECT * FROM posts WHERE id = ?", [
      id,
    ]);

    return res.status(200).json({
      success: true,
      message: "Post updated successfully",
      data: {
        ...updatedRows[0],
        tagIds: currentTagIds,
        mediaFiles: currentMediaFiles,
      },
    });
  } catch (error) {
    console.error("Error updating post:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// app.delete("/api/posts/:id", async (req, res) => {
//   try {
//     // Read userId from query params
//     const userId = req.query.userid || req.query.userId;
//     const post = await Post.findById(req.params.id);

//     if (!post) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found" });
//     }

//     // Compare string representations of the user IDs
//     const postUserId = post.userId ? post.userId.toString() : "";
//     const incomingUserId = userId ? userId.toString() : "";

//     if (!incomingUserId || postUserId !== incomingUserId) {
//       return res
//         .status(403)
//         .json({ success: false, message: "Unauthorized action" });
//     }

//     // Delete attached media files from AWS S3
//     if (post.mediaFiles && post.mediaFiles.length > 0) {
//       for (const file of post.mediaFiles) {
//         // Handle both file.fileLink and file.url schema variants
//         const fileUrl = file.fileLink || file.url || file.path;
//         const s3Key = getS3KeyFromUrl(fileUrl);

//         if (s3Key) {
//           try {
//             await s3.send(
//               new DeleteObjectCommand({
//                 Bucket: process.env.AWS_BUCKET_NAME,
//                 Key: s3Key,
//               }),
//             );
//             console.log(`Successfully deleted S3 key: ${s3Key}`);
//           } catch (s3Err) {
//             console.error(`Failed to delete S3 key (${s3Key}):`, s3Err);
//           }
//         }
//       }
//     }

//     // Delete post document from MongoDB
//     await Post.findByIdAndDelete(req.params.id);

//     return res.status(200).json({
//       success: true,
//       message: "Post and S3 media deleted successfully",
//     });
//   } catch (error) {
//     console.error("Error deleting post:", error);
//     return res.status(500).json({ success: false, error: error.message });
//   }
// });

// sql
app.delete("/api/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userid || req.query.userId;

    // 1. Fetch post to get owner info and media files
    const [posts] = await db.execute(
      "SELECT id, userId, mediaFiles FROM posts WHERE id = ?",
      [id],
    );

    if (!posts || posts.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    const post = posts[0];

    // 2. Authorization check
    const postUserId = post.userId ? String(post.userId) : "";
    const incomingUserId = userId ? String(userId) : "";

    if (!incomingUserId || postUserId !== incomingUserId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });
    }

    // 3. Parse media files JSON and delete from AWS S3
    let mediaFiles = [];
    try {
      mediaFiles =
        typeof post.mediaFiles === "string"
          ? JSON.parse(post.mediaFiles || "[]")
          : post.mediaFiles || [];
    } catch {
      mediaFiles = [];
    }

    if (Array.isArray(mediaFiles) && mediaFiles.length > 0) {
      for (const file of mediaFiles) {
        const fileUrl = file.fileLink || file.url || file.path;
        const s3Key = getS3KeyFromUrl(fileUrl);

        if (s3Key) {
          try {
            await s3.send(
              new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: s3Key,
              }),
            );
            console.log(`Successfully deleted S3 key: ${s3Key}`);
          } catch (s3Err) {
            console.error(`Failed to delete S3 key (${s3Key}):`, s3Err);
          }
        }
      }
    }

    // 4. Delete associated comments first (if not handled by ON DELETE CASCADE)
    await db.execute("DELETE FROM comments WHERE postId = ?", [id]);

    // 5. Delete post record from MySQL
    await db.execute("DELETE FROM posts WHERE id = ?", [id]);

    return res.status(200).json({
      success: true,
      message: "Post and S3 media deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting post:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
// CREATE SESSION
// app.post("/api/session", async (req, res) => {
//   try {
//     const {
//       title,
//       date,
//       startTime,
//       endTime,
//       occurrence,
//       linkTypeNote,
//       meetingUrl,
//       courseType,
//       language,
//     } = req.body;

//     const formattedLang = language;

//     if (
//       !title ||
//       !date ||
//       !startTime ||
//       !endTime ||
//       !meetingUrl ||
//       !courseType ||
//       !formattedLang
//     ) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing required fields." });
//     }

//     const newSession = new LiveSession({
//       title,
//       date,
//       startTime,
//       endTime,
//       occurrence,
//       linkTypeNote,
//       meetingUrl,
//       courseType,
//       language: formattedLang,
//     });

//     const savedSession = await newSession.save();
//     return res.status(201).json({ success: true, data: savedSession });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// sql
app.post("/api/session", async (req, res) => {
  try {
    const {
      title,
      date,
      startTime,
      endTime,
      occurrence,
      linkTypeNote,
      meetingUrl,
      courseType,
      language,
    } = req.body;

    const formattedLang = language;

    if (
      !title ||
      !date ||
      !startTime ||
      !endTime ||
      !meetingUrl ||
      !courseType ||
      !formattedLang
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields." });
    }

    // 1. Insert new live session record into MySQL
    const insertQuery = `
      INSERT INTO livesessions 
        (title, date, startTime, endTime, occurrence, linkTypeNote, meetingUrl, courseType, language) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.execute(insertQuery, [
      title,
      date,
      startTime,
      endTime,
      occurrence || null,
      linkTypeNote || null,
      meetingUrl,
      courseType,
      formattedLang,
    ]);

    // 2. Fetch the newly inserted record to return in the response
    const [rows] = await db.execute("SELECT * FROM livesessions WHERE id = ?", [
      result.insertId,
    ]);

    return res.status(201).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Error creating live session:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// app.get("/api/session", async (req, res) => {
//   try {
//     const { language, courseType, role } = req.query;

//     const filter = {};

//     // 1. Language filter (applies to both Users and Admins)
//     if (language) {
//       const lower = language.toLowerCase();
//       if (lower === "te" || lower === "telugu") filter.language = "Telugu";
//       else if (lower === "en" || lower === "english")
//         filter.language = "English";
//       else filter.language = language;
//     }

//     // 2. CourseType filter (ONLY applied if user is NOT an admin)
//     const isAdmin = role && role.toLowerCase() === "admin";
//     if (!isAdmin && courseType) {
//       filter.courseType = courseType;
//     }

//     const sessions = await LiveSession.find(filter).sort({ createdAt: -1 });

//     return res.status(200).json({ success: true, data: sessions });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// app.get("/api/session", async (req, res) => {
//   try {
//     const { language, courseType, role } = req.query;

//     const filter = {};

//     // 1. Language filter (applies to both Users and Admins)
//     if (language) {
//       const lower = language.toLowerCase();
//       if (lower === "te" || lower === "telugu") filter.language = "Telugu";
//       else if (lower === "en" || lower === "english")
//         filter.language = "English";
//       else filter.language = language;
//     }

//     // 2. CourseType filter (ONLY applied if user is NOT an admin)
//     const isAdmin = role && role.toLowerCase() === "admin";
//     if (!isAdmin && courseType) {
//       filter.courseType = courseType;
//     }

//     const sessions = await LiveSession.find(filter).sort({ createdAt: -1 });

//     return res.status(200).json({ success: true, data: sessions });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// sql
app.get("/api/session", async (req, res) => {
  try {
    const { language, courseType, role } = req.query;

    const conditions = [];
    const queryParams = [];

    // 1. Language filter (applies to both Users and Admins)
    if (language) {
      const lower = language.toLowerCase();
      let targetLanguage = language;
      if (lower === "te" || lower === "telugu") targetLanguage = "Telugu";
      else if (lower === "en" || lower === "english")
        targetLanguage = "English";

      conditions.push("language = ?");
      queryParams.push(targetLanguage);
    }

    // 2. CourseType filter (ONLY applied if user is NOT an admin)
    const isAdmin = role && role.toLowerCase() === "admin";
    if (!isAdmin && courseType) {
      conditions.push("courseType = ?");
      queryParams.push(courseType);
    }

    // 3. Construct dynamic SQL query
    let sql = "SELECT * FROM livesessions";
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY created_at DESC";

    const [sessions] = await db.execute(sql, queryParams);

    return res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    console.error("Error fetching live sessions:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});
// UPDATE SESSION
// app.put("/api/session/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const updateData = { ...req.body };

//     if (updateData.language) {
//       updateData.language = updateData.language;
//     }

//     const updatedSession = await LiveSession.findByIdAndUpdate(id, updateData, {
//       new: true,
//     });

//     if (!updatedSession) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Session not found." });
//     }

//     return res.status(200).json({ success: true, data: updatedSession });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// sql
app.put("/api/session/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // 1. Defined list of allowed columns to prevent SQL injection or bad fields
    const allowedFields = [
      "title",
      "date",
      "startTime",
      "endTime",
      "occurrence",
      "linkTypeNote",
      "meetingUrl",
      "courseType",
      "language",
    ];

    const updates = [];
    const queryParams = [];

    // 2. Build SET clause dynamically for fields provided in req.body
    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        updates.push(`${field} = ?`);
        queryParams.push(updateData[field]);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update.",
      });
    }

    // Append id parameter for the WHERE clause
    queryParams.push(id);

    const updateQuery = `
      UPDATE live_sessions 
      SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;

    // 3. Execute UPDATE query
    const [result] = await db.execute(updateQuery, queryParams);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found." });
    }

    // 4. Fetch and return the updated record
    const [rows] = await db.execute(
      "SELECT * FROM live_sessions WHERE id = ?",
      [id],
    );

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error updating live session:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE SESSION
// app.delete("/api/session/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const deletedSession = await LiveSession.findByIdAndDelete(id);

//     if (!deletedSession) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Session not found." });
//     }

//     return res
//       .status(200)
//       .json({ success: true, message: "Session deleted successfully." });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// sql
app.delete("/api/session/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Execute DELETE query
    const [result] = await db.execute(
      "DELETE FROM live_sessions WHERE id = ?",
      [id],
    );

    // 2. Check if any row was deleted
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found." });
    }

    return res
      .status(200)
      .json({ success: true, message: "Session deleted successfully." });
  } catch (error) {
    console.error("Error deleting live session:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET: Fetch products filtered by language
app.get("/api/products", async (req, res) => {
  try {
    const { language } = req.query;
    const formattedLang = language;

    const filter = {};
    if (formattedLang) filter.language = formattedLang;

    const products = await Product.find(filter).sort({ createdAt: -1 });
    return res
      .status(200)
      .json({ success: true, count: products.length, data: products });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Admin create new product link with language
app.post("/api/products", async (req, res) => {
  try {
    const { title, productUrl, imageUrl, language } = req.body;
    const formattedLang = language;

    if (!title || !productUrl || !imageUrl || !formattedLang) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields including language.",
      });
    }

    const newProduct = new Product({
      title,
      productUrl,
      imageUrl,
      language: formattedLang,
    });
    const savedProduct = await newProduct.save();

    return res.status(201).json({ success: true, data: savedProduct });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT: Admin update existing product
app.put("/api/products/:id", async (req, res) => {
  try {
    const { title, productUrl, imageUrl, language } = req.body;
    const updateFields = {};

    if (title) updateFields.title = title;
    if (productUrl) updateFields.productUrl = productUrl;
    if (imageUrl) updateFields.imageUrl = imageUrl;
    if (language) updateFields.language = language;

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true },
    );

    if (!updatedProduct) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found." });
    }

    return res.status(200).json({ success: true, data: updatedProduct });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE: Admin remove product
app.delete("/api/products/:id", async (req, res) => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);

    if (!deletedProduct) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found." });
    }

    return res
      .status(200)
      .json({ success: true, message: "Product deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET user tracker data
app.get("/api/tracker-status/:userId", async (req, res) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;
  try {
    const user = await User.findById(req.params.userId);

    if (user.completedPracticeDates.includes(todayStr)) {
      return res.json({
        success: true,
        completedPracticeDates: user.completedPracticeDates,
        message: "Daily practice already completed for today.",
      });
    } else {
      res.json({
        success: true,
        points: user.points,
        completedPracticeDates: user.completedPracticeDates,
      });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST complete today's tracker (Adds +10 points)
app.post("/api/complete-today", async (req, res) => {
  const { userId } = req.body;

  // Format current server date to YYYY-MM-DD
  // const todayStr = new Date().toISOString().split("T")[0];
  // Format current date to YYYY-MM-DD using Local Server Time zone
  // const now = new Date();
  // const year = now.getFullYear();
  // const month = String(now.getMonth() + 1).padStart(2, "0");
  // const day = String(now.getDate()).padStart(2, "0");
  // const todayStr = `${year}-${month}-${day}`;

  const now = new Date();

  // Extract YYYY, MM, DD relative to Asia/Kolkata
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;

  const todayStr = `${year}-${month}-${day}`;

  try {
    const user = await User.findById(userId);

    // Guard: Prevent double-claiming today
    console.log("todayStr", todayStr);
    if (user.completedPracticeDates.includes(todayStr)) {
      return res.json({
        success: true,
        message: "Daily practice already completed for today.",
      });
    }

    // Append today's date and increment points by 10
    user.completedPracticeDates.push(todayStr);
    user.points += 10;

    await user.save();
    return res.json({
      success: true,
      points: user.points,
      completedPracticeDates: user.completedPracticeDates,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Helper to get date strings in YYYY-MM-DD
function getFormattedDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// app.get("/api/leaderboard", async (req, res) => {
//   try {
//     const { lang } = req.query; // 'English' or 'Telugu'
//     const now = new Date();

//     // 1. Current Month Prefix (YYYY-MM)
//     const year = now.getFullYear();
//     const month = String(now.getMonth() + 1).padStart(2, "0");
//     const currentMonthPrefix = `${year}-${month}`;

//     // 2. Current Week Bounds (Monday to Sunday)
//     const currentDayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon...
//     const distanceToMon = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;

//     const monday = new Date(now);
//     monday.setDate(now.getDate() + distanceToMon);

//     const sunday = new Date(monday);
//     sunday.setDate(monday.getDate() + 6);

//     const startOfWeekStr = getFormattedDate(monday);
//     const endOfWeekStr = getFormattedDate(sunday);

//     // Base Filter for Language
//     const matchStage = lang ? { language: lang } : {};

//     const leaderboardData = await User.aggregate([
//       { $match: matchStage },
//       {
//         $project: {
//           username: 1,
//           language: 1,
//           points: 1,
//           completedPracticeDates: 1,

//           // Count entries in current month
//           monthlyCount: {
//             $size: {
//               $filter: {
//                 input: { $ifNull: ["$completedPracticeDates", []] },
//                 as: "dateStr",
//                 cond: {
//                   $eq: [
//                     { $substrBytes: ["$$dateStr", 0, 7] },
//                     currentMonthPrefix,
//                   ],
//                 },
//               },
//             },
//           },

//           // Count entries in current week
//           weeklyCount: {
//             $size: {
//               $filter: {
//                 input: { $ifNull: ["$completedPracticeDates", []] },
//                 as: "dateStr",
//                 cond: {
//                   $and: [
//                     { $gte: ["$$dateStr", startOfWeekStr] },
//                     { $lte: ["$$dateStr", endOfWeekStr] },
//                   ],
//                 },
//               },
//             },
//           },
//         },
//       },
//       {
//         $facet: {
//           // Top 4 All-Time (Sorted by total points)
//           allTime: [{ $sort: { points: -1 } }, { $limit: 4 }],

//           // Top 4 Monthly (Sorted by current month completed days, then total points)
//           monthly: [{ $sort: { monthlyCount: -1, points: -1 } }, { $limit: 4 }],

//           // Top 4 Weekly (Sorted by current week completed days, then total points)
//           weekly: [{ $sort: { weeklyCount: -1, points: -1 } }, { $limit: 4 }],
//         },
//       },
//     ]);

//     const result = leaderboardData[0];

//     return res.json({
//       success: true,
//       allTime: result.allTime || [],
//       monthly: result.monthly || [],
//       weekly: result.weekly || [],
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// app.get("/api/leaderboard", async (req, res) => {
//   try {
//     const { lang } = req.query; // 'English' or 'Telugu'
//     const now = new Date();

//     // 1. Current Month Prefix (YYYY-MM)
//     const year = now.getFullYear();
//     const month = String(now.getMonth() + 1).padStart(2, "0");
//     const currentMonthPrefix = `${year}-${month}`;

//     // 2. Current Week Bounds (Monday to Sunday)
//     const currentDayOfWeek = now.getDay();
//     const distanceToMon = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;

//     const monday = new Date(now);
//     monday.setDate(now.getDate() + distanceToMon);

//     const sunday = new Date(monday);
//     sunday.setDate(monday.getDate() + 6);

//     const startOfWeekStr = getFormattedDate(monday); // Expected YYYY-MM-DD
//     const endOfWeekStr = getFormattedDate(sunday); // Expected YYYY-MM-DD

//     // 3. Build Base SQL Query with JSON date filtering logic
//     let baseWhereClause = "";
//     const params = [currentMonthPrefix, startOfWeekStr, endOfWeekStr];

//     if (lang) {
//       baseWhereClause = "WHERE language = ?";
//       params.push(lang);
//     }

//     const baseQuery = `
//       SELECT
//         id AS _id,
//         username,
//         language,
//         points,
//         completedPracticeDates,

//         -- Calculate count of completed dates in current month
//         (
//           SELECT COUNT(*)
//           FROM JSON_TABLE(
//             COALESCE(completedPracticeDates, '[]'),
//             '$[*]' COLUMNS (dateStr VARCHAR(50) PATH '$')
//           ) AS m_dates
//           WHERE m_dates.dateStr LIKE CONCAT(?, '%')
//         ) AS monthlyCount,

//         -- Calculate count of completed dates in current week
//         (
//           SELECT COUNT(*)
//           FROM JSON_TABLE(
//             COALESCE(completedPracticeDates, '[]'),
//             '$[*]' COLUMNS (dateStr VARCHAR(50) PATH '$')
//           ) AS w_dates
//           WHERE w_dates.dateStr >= ? AND w_dates.dateStr <= ?
//         ) AS weeklyCount
//       FROM register
//       ${baseWhereClause}
//     `;

//     // 4. Run queries for allTime, monthly, and weekly categories parallelly
//     const [allTimeRows] = await db.execute(
//       `${baseQuery} ORDER BY points DESC LIMIT 4`,
//       params,
//     );

//     const [monthlyRows] = await db.execute(
//       `${baseQuery} ORDER BY monthlyCount DESC, points DESC LIMIT 4`,
//       params,
//     );

//     const [weeklyRows] = await db.execute(
//       `${baseQuery} ORDER BY weeklyCount DESC, points DESC LIMIT 4`,
//       params,
//     );

//     // Helper to safely format output records
//     const formatUser = (user) => {
//       let dates = user.completedPracticeDates;
//       if (typeof dates === "string") {
//         try {
//           dates = JSON.parse(dates || "[]");
//         } catch {
//           dates = [];
//         }
//       }
//       return {
//         _id: user._id,
//         username: user.username || "",
//         language: user.language || "",
//         points: user.points || 0,
//         completedPracticeDates: dates || [],
//         monthlyCount: Number(user.monthlyCount || 0),
//         weeklyCount: Number(user.weeklyCount || 0),
//       };
//     };

//     return res.json({
//       success: true,
//       allTime: allTimeRows.map(formatUser),
//       monthly: monthlyRows.map(formatUser),
//       weekly: weeklyRows.map(formatUser),
//     });
//   } catch (err) {
//     console.error("Error fetching leaderboard:", err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// });

// app.get("/api/leaderboard", async (req, res) => {
//   try {
//     const { lang } = req.query; // 'English' or 'Telugu'
//     const now = new Date();

//     // 1. Current Month Prefix (YYYY-MM)
//     const year = now.getFullYear();
//     const month = String(now.getMonth() + 1).padStart(2, "0");
//     const currentMonthPrefix = `${year}-${month}`;

//     // 2. Current Week Bounds (Monday to Sunday)
//     const currentDayOfWeek = now.getDay();
//     const distanceToMon = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;

//     const monday = new Date(now);
//     monday.setDate(now.getDate() + distanceToMon);

//     const sunday = new Date(monday);
//     sunday.setDate(monday.getDate() + 6);

//     const startOfWeekStr = getFormattedDate(monday); // Expected YYYY-MM-DD
//     const endOfWeekStr = getFormattedDate(sunday); // Expected YYYY-MM-DD

//     // 3. Build Base SQL Query with Explicit Collation
//     let baseWhereClause = "";
//     const params = [currentMonthPrefix, startOfWeekStr, endOfWeekStr];

//     if (lang) {
//       baseWhereClause = "WHERE language = ?";
//       params.push(lang);
//     }

//     const baseQuery = `
//       SELECT
//         id AS _id,
//         username,
//         language,
//         points,
//         completedPracticeDates,

//         -- Calculate count of completed dates in current month
//         (
//           SELECT COUNT(*)
//           FROM JSON_TABLE(
//             COALESCE(completedPracticeDates, '[]'),
//             '$[*]' COLUMNS (
//               dateStr VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PATH '$'
//             )
//           ) AS m_dates
//           WHERE m_dates.dateStr LIKE CONCAT(?, '%')
//         ) AS monthlyCount,

//         -- Calculate count of completed dates in current week
//         (
//           SELECT COUNT(*)
//           FROM JSON_TABLE(
//             COALESCE(completedPracticeDates, '[]'),
//             '$[*]' COLUMNS (
//               dateStr VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PATH '$'
//             )
//           ) AS w_dates
//           WHERE w_dates.dateStr >= ? AND w_dates.dateStr <= ?
//         ) AS weeklyCount
//       FROM register
//       ${baseWhereClause}
//     `;

//     // 4. Run queries parallelly
//     const [allTimeRows] = await db.execute(
//       `${baseQuery} ORDER BY points DESC LIMIT 4`,
//       params,
//     );

//     const [monthlyRows] = await db.execute(
//       `${baseQuery} ORDER BY monthlyCount DESC, points DESC LIMIT 4`,
//       params,
//     );

//     const [weeklyRows] = await db.execute(
//       `${baseQuery} ORDER BY weeklyCount DESC, points DESC LIMIT 4`,
//       params,
//     );

//     // Format output structure
//     const formatUser = (user) => {
//       let dates = user.completedPracticeDates;
//       if (typeof dates === "string") {
//         try {
//           dates = JSON.parse(dates || "[]");
//         } catch {
//           dates = [];
//         }
//       }
//       return {
//         _id: user._id,
//         username: user.username || "",
//         language: user.language || "",
//         points: user.points || 0,
//         completedPracticeDates: dates || [],
//         monthlyCount: Number(user.monthlyCount || 0),
//         weeklyCount: Number(user.weeklyCount || 0),
//       };
//     };

//     return res.json({
//       success: true,
//       allTime: allTimeRows.map(formatUser),
//       monthly: monthlyRows.map(formatUser),
//       weekly: weeklyRows.map(formatUser),
//     });
//   } catch (err) {
//     console.error("Error fetching leaderboard:", err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// });

// app.get("/api/leaderboard", async (req, res) => {
//   try {
//     const { lang } = req.query; // 'English' or 'Telugu'
//     const now = new Date();

//     // 1. Current Month Prefix (YYYY-MM)
//     const year = now.getFullYear();
//     const month = String(now.getMonth() + 1).padStart(2, "0");
//     const currentMonthPrefix = `${year}-${month}`;

//     // 2. Current Week Bounds (Monday to Sunday)
//     const currentDayOfWeek = now.getDay();
//     const distanceToMon = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;

//     const monday = new Date(now);
//     monday.setDate(now.getDate() + distanceToMon);

//     const sunday = new Date(monday);
//     sunday.setDate(monday.getDate() + 6);

//     const startOfWeekStr = getFormattedDate(monday); // Expected YYYY-MM-DD
//     const endOfWeekStr = getFormattedDate(sunday); // Expected YYYY-MM-DD

//     // 3. Build Base SQL Query with explicit collation on parameter inputs
//     let baseWhereClause = "";
//     const params = [currentMonthPrefix, startOfWeekStr, endOfWeekStr];

//     if (lang) {
//       baseWhereClause = "WHERE language = ?";
//       params.push(lang);
//     }

//     const baseQuery = `
//       SELECT
//         id AS _id,
//         username,
//         language,
//         points,
//         completedPracticeDates,

//         -- Calculate count of completed dates in current month
//         (
//           SELECT COUNT(*)
//           FROM JSON_TABLE(
//             COALESCE(completedPracticeDates, '[]'),
//             '$[*]' COLUMNS (
//               dateStr VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PATH '$'
//             )
//           ) AS m_dates
//           WHERE m_dates.dateStr LIKE CONCAT(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%')
//         ) AS monthlyCount,

//         -- Calculate count of completed dates in current week
//         (
//           SELECT COUNT(*)
//           FROM JSON_TABLE(
//             COALESCE(completedPracticeDates, '[]'),
//             '$[*]' COLUMNS (
//               dateStr VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PATH '$'
//             )
//           ) AS w_dates
//           WHERE m_dates.dateStr >= CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
//             AND m_dates.dateStr <= CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
//         ) AS weeklyCount
//       FROM register
//       ${baseWhereClause}
//     `;

//     // 4. Run queries parallelly
//     const [allTimeRows] = await db.execute(
//       `${baseQuery} ORDER BY points DESC LIMIT 4`,
//       params,
//     );

//     const [monthlyRows] = await db.execute(
//       `${baseQuery} ORDER BY monthlyCount DESC, points DESC LIMIT 4`,
//       params,
//     );

//     const [weeklyRows] = await db.execute(
//       `${baseQuery} ORDER BY weeklyCount DESC, points DESC LIMIT 4`,
//       params,
//     );

//     // Format output structure
//     const formatUser = (user) => {
//       let dates = user.completedPracticeDates;
//       if (typeof dates === "string") {
//         try {
//           dates = JSON.parse(dates || "[]");
//         } catch {
//           dates = [];
//         }
//       }
//       return {
//         _id: user._id,
//         username: user.username || "",
//         language: user.language || "",
//         points: user.points || 0,
//         completedPracticeDates: dates || [],
//         monthlyCount: Number(user.monthlyCount || 0),
//         weeklyCount: Number(user.weeklyCount || 0),
//       };
//     };

//     return res.json({
//       success: true,
//       allTime: allTimeRows.map(formatUser),
//       monthly: monthlyRows.map(formatUser),
//       weekly: weeklyRows.map(formatUser),
//     });
//   } catch (err) {
//     console.error("Error fetching leaderboard:", err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// });

app.get("/api/leaderboard", async (req, res) => {
  try {
    const { lang } = req.query; // 'English' or 'Telugu'
    const now = new Date();

    // 1. Current Month Prefix (YYYY-MM)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const currentMonthPrefix = `${year}-${month}`;

    // 2. Current Week Bounds (Monday to Sunday)
    const currentDayOfWeek = now.getDay();
    const distanceToMon = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;

    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMon);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startOfWeekStr = getFormattedDate(monday); // Expected YYYY-MM-DD
    const endOfWeekStr = getFormattedDate(sunday); // Expected YYYY-MM-DD

    // 3. Build Base SQL Query
    let baseWhereClause = "";
    const params = [currentMonthPrefix, startOfWeekStr, endOfWeekStr];

    if (lang) {
      baseWhereClause = "WHERE language = ?";
      params.push(lang);
    }

    const baseQuery = `
      SELECT 
        id AS _id,
        username,
        language,
        points,
        completedPracticeDates,

        -- Calculate count of completed dates in current month
        (
          SELECT COUNT(*)
          FROM JSON_TABLE(
            COALESCE(completedPracticeDates, '[]'),
            '$[*]' COLUMNS (
              dateStr VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PATH '$'
            )
          ) AS m_dates
          WHERE m_dates.dateStr LIKE CONCAT(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%')
        ) AS monthlyCount,

        -- Calculate count of completed dates in current week
        (
          SELECT COUNT(*)
          FROM JSON_TABLE(
            COALESCE(completedPracticeDates, '[]'),
            '$[*]' COLUMNS (
              dateStr VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PATH '$'
            )
          ) AS w_dates
          WHERE w_dates.dateStr >= CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
            AND w_dates.dateStr <= CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        ) AS weeklyCount
      FROM register
      ${baseWhereClause}
    `;

    // 4. Run queries in parallel
    const [allTimeRows] = await db.execute(
      `${baseQuery} ORDER BY points DESC LIMIT 4`,
      params,
    );

    const [monthlyRows] = await db.execute(
      `${baseQuery} ORDER BY monthlyCount DESC, points DESC LIMIT 4`,
      params,
    );

    const [weeklyRows] = await db.execute(
      `${baseQuery} ORDER BY weeklyCount DESC, points DESC LIMIT 4`,
      params,
    );

    // Helper to format output structure safely
    const formatUser = (user) => {
      let dates = user.completedPracticeDates;
      if (typeof dates === "string") {
        try {
          dates = JSON.parse(dates || "[]");
        } catch {
          dates = [];
        }
      }
      return {
        _id: user._id,
        username: user.username || "",
        language: user.language || "",
        points: user.points || 0,
        completedPracticeDates: dates || [],
        monthlyCount: Number(user.monthlyCount || 0),
        weeklyCount: Number(user.weeklyCount || 0),
      };
    };

    return res.json({
      success: true,
      allTime: allTimeRows.map(formatUser),
      monthly: monthlyRows.map(formatUser),
      weekly: weeklyRows.map(formatUser),
    });
  } catch (err) {
    console.error("Error fetching leaderboard:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET: Admin fetch users with points & tracker details by language
app.get("/api/admin-users-tracker", async (req, res) => {
  try {
    const { language } = req.query;

    let formattedLang;
    if (language) {
      const lower = language.toLowerCase();
      if (lower === "te" || lower === "telugu") formattedLang = "Telugu";
      if (lower === "en" || lower === "english") formattedLang = "English";
    }

    const filter = {};
    if (formattedLang) {
      filter.language = formattedLang;
    }

    // Select fields required for admin list
    const users = await User.find(filter)
      .select("username name email points completedPracticeDates language role")
      .sort({ points: -1 }); // Rank by highest points

    const formattedData = users.map((u) => ({
      _id: u._id,
      name: u.name || u.username || "Student",
      email: u.email,
      points: u.points || 0,
      language: u.language,
      totalCompletedDays: u.completedPracticeDates
        ? u.completedPracticeDates.length
        : 0,
    }));

    return res.status(200).json({
      success: true,
      count: formattedData.length,
      data: formattedData,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// app.post("/api/admin-posts", async (req, res) => {
//   try {
//     const { userId, content, tagIds, fileLink, fileLinks, targetLanguage } =
//       req.body;

//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "userId is required to create a post.",
//       });
//     }

//     if (!mongoose.Types.ObjectId.isValid(userId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid userId format provided.",
//       });
//     }

//     // 1. Fetch Author (Admin)
//     let author = await User.findById(userId);
//     if (!author) {
//       author = await User.findOne({ role: "admin" });
//     }
//     if (!author) {
//       return res.status(404).json({
//         success: false,
//         message: "Post author not found in database.",
//       });
//     }

//     // 2. Determine target language for the post
//     const postLanguage = targetLanguage || author.language || "English";

//     // Safely parse JSON strings sent from FormData/JSON payload
//     let parsedTagIds = [];
//     if (tagIds) {
//       try {
//         parsedTagIds = typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
//       } catch (e) {
//         parsedTagIds = [];
//       }
//     }

//     // 3. Process incoming S3 file URLs (supports single string or array)
//     const rawLinks = fileLinks
//       ? Array.isArray(fileLinks)
//         ? fileLinks
//         : [fileLinks]
//       : fileLink
//         ? [fileLink]
//         : [];

//     const mediaFiles = rawLinks
//       .filter((link) => typeof link === "string" && link.trim() !== "")
//       .map((link) => ({
//         fileLink: link.trim(),
//         mediaType: getMediaTypeFromUrl(link),
//       }));

//     // 4. Save AdminPost with designated language and S3 media URLs
//     const newPost = new AdminPost({
//       userId: author._id,
//       content: content || "",
//       language: postLanguage,
//       tagIds: parsedTagIds,
//       courseType: author.courseType,
//       mediaFiles,
//     });

//     await newPost.save();

//     // 5. STRICT FILTER: Fetch recipients whose language matches postLanguage
//     const targetUsers = await User.find({
//       _id: { $ne: author._id },
//       language: postLanguage,
//     }).select("_id");

//     console.log(`Admin Post Created for Stream: ${postLanguage}`);
//     console.log(`Notifying ${targetUsers.length} ${postLanguage} students.`);

//     // 6. Send notifications to matching students
//     if (targetUsers.length > 0) {
//       const notifications = targetUsers.map((user) => ({
//         recipient: user._id,
//         sender: author._id,
//         postId: newPost._id,
//         postModel: "AdminPost",
//         postContentSnippet: content ? content.trim() : "Uploaded media post.",
//         isRead: false,
//       }));

//       await Notification.insertMany(notifications);
//     }

//     return res.status(201).json({
//       success: true,
//       message: `Admin post published to ${postLanguage} students successfully.`,
//       data: newPost,
//     });
//   } catch (error) {
//     console.error("Error creating admin post:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });

app.post("/api/admin-posts", async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { userId, content, tagIds, fileLink, fileLinks, targetLanguage } =
      req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required to create a post.",
      });
    }

    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId format provided.",
      });
    }

    // 1. Fetch Author (Admin)
    let [authors] = await connection.execute(
      "SELECT id, role, language, courseType FROM register WHERE id = ?",
      [parsedUserId],
    );

    let author = authors.length > 0 ? authors[0] : null;

    // Fallback: Find any admin user if specific userId is not found
    if (!author) {
      const [adminRows] = await connection.execute(
        "SELECT id, role, language, courseType FROM register WHERE role = 'admin' LIMIT 1",
      );
      if (adminRows.length > 0) {
        author = adminRows[0];
      }
    }

    if (!author) {
      return res.status(404).json({
        success: false,
        message: "Post author not found in database.",
      });
    }

    // 2. Determine target language for the post
    const postLanguage = targetLanguage || author.language || "English";

    // Safely parse JSON strings sent from FormData/JSON payload
    let parsedTagIds = [];
    if (tagIds) {
      try {
        parsedTagIds = typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
      } catch (e) {
        parsedTagIds = [];
      }
    }

    // 3. Process incoming S3 file URLs
    const rawLinks = fileLinks
      ? Array.isArray(fileLinks)
        ? fileLinks
        : [fileLinks]
      : fileLink
        ? [fileLink]
        : [];

    const mediaFiles = rawLinks
      .filter((link) => typeof link === "string" && link.trim() !== "")
      .map((link) => ({
        fileLink: link.trim(),
        mediaType: getMediaTypeFromUrl(link),
      }));

    // Start transaction for atomic insertion
    await connection.beginTransaction();

    // 4. Save AdminPost with designated language and S3 media URLs
    const insertAdminPostQuery = `
      INSERT INTO adminposts 
        (userId, content, language, tagIds, courseType, mediaFiles) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const [postResult] = await connection.execute(insertAdminPostQuery, [
      author.id,
      content ? content.trim() : "",
      postLanguage,
      JSON.stringify(parsedTagIds),
      author.courseType
        ? JSON.stringify(author.courseType)
        : JSON.stringify([]),
      JSON.stringify(mediaFiles),
    ]);

    const newAdminPostId = postResult.insertId;

    // 5. STRICT FILTER: Fetch recipients whose language matches postLanguage
    const [targetUsers] = await connection.execute(
      "SELECT id FROM register WHERE id != ? AND language = ?",
      [author.id, postLanguage],
    );

    console.log(`Admin Post Created for Stream: ${postLanguage}`);
    console.log(`Notifying ${targetUsers.length} ${postLanguage} students.`);

    // 6. Send notifications to matching students
    if (targetUsers.length > 0) {
      const snippet = content ? content.trim() : "Uploaded media post.";

      const notificationValues = targetUsers.map((user) => [
        user.id, // recipientId
        author.id, // senderId
        "post", // type
        null, // postId (NULL for AdminPost)
        newAdminPostId, // adminPostId
        null, // commentId
        "AdminPost", // postModel
        snippet, // postContentSnippet
        false, // isRead
      ]);

      const insertNotificationsQuery = `
        INSERT INTO notifications 
          (recipientId, senderId, type, postId, adminPostId, commentId, postModel, postContentSnippet, isRead) 
        VALUES ?
      `;

      await connection.query(insertNotificationsQuery, [notificationValues]);
    }

    // Commit transaction
    await connection.commit();

    const newPost = {
      _id: newAdminPostId,
      userId: author.id,
      content: content ? content.trim() : "",
      language: postLanguage,
      tagIds: parsedTagIds,
      courseType: author.courseType,
      mediaFiles,
      views: 0,
      likes: [],
      likeCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return res.status(201).json({
      success: true,
      message: `Admin post published to ${postLanguage} students successfully.`,
      data: newPost,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error creating admin post:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  } finally {
    connection.release();
  }
});

// app.get("/api/admin-posts", async (req, res) => {
//   try {
//     const { language } = req.query;

//     let formattedLang;
//     if (language) {
//       const lower = language.toLowerCase();
//       if (lower === "te" || lower === "telugu") formattedLang = "Telugu";
//       if (lower === "en" || lower === "english") formattedLang = "English";
//     }

//     const posts = await AdminPost.aggregate([
//       // 1. Join Admin Post Author details safely
//       {
//         $lookup: {
//           from: "register",
//           let: { postUserId: "$userId" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [{ $toString: "$_id" }, { $toString: "$$postUserId" }],
//                 },
//               },
//             },
//           ],
//           as: "authorDetails",
//         },
//       },
//       {
//         $unwind: {
//           path: "$authorDetails",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       // 2. Filter posts by language match if query provided
//       ...(formattedLang
//         ? [
//             {
//               $match: {
//                 $or: [
//                   { language: formattedLang },
//                   { "authorDetails.language": formattedLang },
//                 ],
//               },
//             },
//           ]
//         : []),

//       // 3. Join Post Author's PersonalDetails by userId (Prefer post lang, fallback to any valid image)
//       {
//         $lookup: {
//           from: "personaldetails",
//           let: {
//             authorId: "$authorDetails._id",
//             postLang: { $ifNull: ["$language", "$authorDetails.language"] },
//           },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [{ $toString: "$userId" }, { $toString: "$$authorId" }],
//                 },
//               },
//             },
//             {
//               $addFields: {
//                 isLangMatch: {
//                   $cond: [{ $eq: ["$language", "$$postLang"] }, 1, 0],
//                 },
//                 hasImage: {
//                   $cond: [
//                     {
//                       $and: [
//                         { $ne: ["$profileImage", null] },
//                         { $ne: ["$profileImage", ""] },
//                       ],
//                     },
//                     1,
//                     0,
//                   ],
//                 },
//               },
//             },
//             { $sort: { isLangMatch: -1, hasImage: -1, createdAt: -1 } },
//           ],
//           as: "authorProfile",
//         },
//       },

//       // 4. Join admincomments and match commenter profile strictly by userId
//       {
//         $lookup: {
//           from: "admincomments",
//           let: {
//             postId: "$_id",
//             postLang: { $ifNull: ["$language", "$authorDetails.language"] },
//           },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [{ $toString: "$postId" }, { $toString: "$$postId" }],
//                 },
//               },
//             },
//             // Join Comment Author User
//             {
//               $lookup: {
//                 from: "register",
//                 let: { commentUserId: "$userId" },
//                 pipeline: [
//                   {
//                     $match: {
//                       $expr: {
//                         $eq: [
//                           { $toString: "$_id" },
//                           { $toString: "$$commentUserId" },
//                         ],
//                       },
//                     },
//                   },
//                 ],
//                 as: "commentAuthor",
//               },
//             },
//             {
//               $unwind: {
//                 path: "$commentAuthor",
//                 preserveNullAndEmptyArrays: true,
//               },
//             },
//             // Join Comment Author's PersonalDetails matching ONLY by userId
//             {
//               $lookup: {
//                 from: "personaldetails",
//                 let: {
//                   commentAuthorId: {
//                     $ifNull: ["$commentAuthor._id", "$userId"],
//                   },
//                   targetLang: "$$postLang",
//                 },
//                 pipeline: [
//                   {
//                     $match: {
//                       $expr: {
//                         $eq: [
//                           { $toString: "$userId" },
//                           { $toString: "$$commentAuthorId" },
//                         ],
//                       },
//                     },
//                   },
//                   {
//                     $addFields: {
//                       isLangMatch: {
//                         $cond: [{ $eq: ["$language", "$$targetLang"] }, 1, 0],
//                       },
//                       hasImage: {
//                         $cond: [
//                           {
//                             $and: [
//                               { $ne: ["$profileImage", null] },
//                               { $ne: ["$profileImage", ""] },
//                             ],
//                           },
//                           1,
//                           0,
//                         ],
//                       },
//                     },
//                   },
//                   { $sort: { isLangMatch: -1, hasImage: -1, createdAt: -1 } },
//                 ],
//                 as: "commentAuthorProfile",
//               },
//             },
//             // Format comment object with profile image fallback
//             {
//               $project: {
//                 _id: 1,
//                 content: 1,
//                 parentId: 1,
//                 createdAt: 1,
//                 userId: {
//                   _id: { $ifNull: ["$commentAuthor._id", "$userId"] },
//                   username: {
//                     $ifNull: ["$commentAuthor.username", "$username"],
//                   },
//                   profileImage: {
//                     $ifNull: [
//                       {
//                         $arrayElemAt: ["$commentAuthorProfile.profileImage", 0],
//                       },
//                       "",
//                     ],
//                   },
//                 },
//               },
//             },
//           ],
//           as: "rawComments",
//         },
//       },

//       // 5. Structure top-level comments and nest corresponding replies
//       {
//         $addFields: {
//           commentCount: { $size: "$rawComments" },
//           allComments: {
//             $map: {
//               input: {
//                 $filter: {
//                   input: "$rawComments",
//                   as: "c",
//                   cond: {
//                     $or: [
//                       { $eq: ["$$c.parentId", null] },
//                       { $eq: ["$$c.parentId", ""] },
//                       { $not: ["$$c.parentId"] },
//                     ],
//                   },
//                 },
//               },
//               as: "parent",
//               in: {
//                 _id: "$$parent._id",
//                 content: "$$parent.content",
//                 createdAt: "$$parent.createdAt",
//                 userId: "$$parent.userId",
//                 replies: {
//                   $filter: {
//                     input: "$rawComments",
//                     as: "reply",
//                     cond: {
//                       $eq: [
//                         { $toString: "$$reply.parentId" },
//                         { $toString: "$$parent._id" },
//                       ],
//                     },
//                   },
//                 },
//               },
//             },
//           },
//           userId: {
//             _id: "$authorDetails._id",
//             username: "$authorDetails.username",
//             mobile: "$authorDetails.mobile",
//             role: "$authorDetails.role",
//             courseType: "$authorDetails.courseType",
//             language: "$authorDetails.language",
//             profileImage: {
//               $ifNull: [
//                 { $arrayElemAt: ["$authorProfile.profileImage", 0] },
//                 "",
//               ],
//             },
//           },
//         },
//       },

//       // 6. Cleanup temp fields and sort
//       {
//         $project: {
//           rawComments: 0,
//           authorDetails: 0,
//           authorProfile: 0,
//         },
//       },
//       { $sort: { createdAt: -1 } },
//     ]);

//     return res.status(200).json({ success: true, data: posts });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// app.get("/api/admin-posts", async (req, res) => {
//   try {
//     const { language } = req.query;

//     let formattedLang;
//     if (language) {
//       const lower = language.toLowerCase();
//       if (lower === "te" || lower === "telugu") formattedLang = "Telugu";
//       if (lower === "en" || lower === "english") formattedLang = "English";
//     }

//     // 1. Fetch Admin Posts joined with Author (register) details
//     let postsQuery = `
//       SELECT
//         ap.id AS _id,
//         ap.userId,
//         ap.content,
//         ap.language,
//         ap.tagIds,
//         ap.courseType,
//         ap.mediaFiles,
//         ap.views,
//         ap.likes,
//         ap.likeCount,
//         ap.created_at AS createdAt,
//         ap.updated_at AS updatedAt,
//         r.id AS authorId,
//         r.username AS authorUsername,
//         r.mobile AS authorMobile,
//         r.role AS authorRole,
//         r.courseType AS authorCourseType,
//         r.language AS authorLanguage
//       FROM adminposts ap
//       LEFT JOIN register r ON ap.userId = r.id
//     `;

//     const queryParams = [];

//     if (formattedLang) {
//       postsQuery += ` WHERE ap.language = ? OR r.language = ?`;
//       queryParams.push(formattedLang, formattedLang);
//     }

//     postsQuery += ` ORDER BY ap.created_at DESC`;

//     const [postRows] = await db.execute(postsQuery, queryParams);

//     if (postRows.length === 0) {
//       return res.status(200).json({ success: true, data: [] });
//     }

//     const postIds = postRows.map((p) => p._id);
//     const authorIds = [
//       ...new Set(postRows.map((p) => p.userId).filter(Boolean)),
//     ];

//     // 2. Batch fetch Author Profile Images from personaldetails
//     let authorProfileMap = {};
//     if (authorIds.length > 0) {
//       const [profiles] = await db.query(
//         `SELECT userId, profileImage, language, created_at FROM personaldetails WHERE userId IN (?)`,
//         [authorIds],
//       );

//       // Rank profiles preferring post language and non-empty image
//       profiles.forEach((p) => {
//         if (
//           !authorProfileMap[p.userId] ||
//           (p.profileImage && p.profileImage.trim() !== "")
//         ) {
//           authorProfileMap[p.userId] = p.profileImage || "";
//         }
//       });
//     }

//     // 3. Batch fetch Comments & Comment Author details for these posts
//     const [commentRows] = await db.query(
//       `
//       SELECT
//         ac.id AS _id,
//         ac.postId,
//         ac.userId,
//         ac.content,
//         ac.parentId,
//         ac.created_at AS createdAt,
//         r.username AS commenterUsername,
//         pd.profileImage AS commenterProfileImage
//       FROM admincomments ac
//       LEFT JOIN register r ON ac.userId = r.id
//       LEFT JOIN personaldetails pd ON ac.userId = pd.userId
//       WHERE ac.postId IN (?)
//       ORDER BY ac.created_at ASC
//       `,
//       [postIds],
//     );

//     // Group comments by postId
//     const commentsByPostId = {};
//     commentRows.forEach((c) => {
//       if (!commentsByPostId[c.postId]) {
//         commentsByPostId[c.postId] = [];
//       }

//       commentsByPostId[c.postId].push({
//         _id: c._id,
//         content: c.content,
//         parentId: c.parentId || null,
//         createdAt: c.createdAt,
//         userId: {
//           _id: c.userId,
//           username: c.commenterUsername || "",
//           profileImage: c.commenterProfileImage || "",
//         },
//       });
//     });

//     // 4. Assemble final posts data structure with nested replies
//     const posts = postRows.map((post) => {
//       // Safely parse JSON strings if stored as JSON/TEXT in MySQL
//       let mediaFiles = post.mediaFiles;
//       let tagIds = post.tagIds;
//       let likes = post.likes;
//       let courseType = post.courseType;

//       if (typeof mediaFiles === "string")
//         mediaFiles = JSON.parse(mediaFiles || "[]");
//       if (typeof tagIds === "string") tagIds = JSON.parse(tagIds || "[]");
//       if (typeof likes === "string") likes = JSON.parse(likes || "[]");
//       if (typeof courseType === "string")
//         courseType = JSON.parse(courseType || "[]");

//       const rawComments = commentsByPostId[post._id] || [];

//       // Separate parent comments and nest replies
//       const parentComments = rawComments.filter((c) => !c.parentId);
//       const allComments = parentComments.map((parent) => ({
//         _id: parent._id,
//         content: parent.content,
//         createdAt: parent.createdAt,
//         userId: parent.userId,
//         replies: rawComments.filter(
//           (c) => String(c.parentId) === String(parent._id),
//         ),
//       }));

//       return {
//         _id: post._id,
//         content: post.content,
//         language: post.language,
//         tagIds,
//         courseType,
//         mediaFiles,
//         views: post.views || 0,
//         likes,
//         likeCount: post.likeCount || 0,
//         commentCount: rawComments.length,
//         allComments,
//         userId: {
//           _id: post.authorId,
//           username: post.authorUsername || "",
//           mobile: post.authorMobile || "",
//           role: post.authorRole || "",
//           courseType: post.authorCourseType || "",
//           language: post.authorLanguage || "",
//           profileImage: authorProfileMap[post.userId] || "",
//         },
//         createdAt: post.createdAt,
//         updatedAt: post.updatedAt,
//       };
//     });

//     return res.status(200).json({ success: true, data: posts });
//   } catch (error) {
//     console.error("Error fetching admin posts:", error);
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// sql
app.get("/api/admin-posts", async (req, res) => {
  try {
    const { language } = req.query;

    let formattedLang;
    if (language) {
      const lower = language.toLowerCase();
      if (lower === "te" || lower === "telugu") formattedLang = "Telugu";
      if (lower === "en" || lower === "english") formattedLang = "English";
    }

    // Helper to safely parse JSON or fall back safely
    const safeJsonParse = (val, fallback = []) => {
      if (!val) return fallback;
      if (typeof val !== "string") return val;
      const trimmed = val.trim();
      if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
        // Plain string value (e.g., "Face Yoga"), return as array/string contextually
        return [trimmed];
      }
      try {
        return JSON.parse(trimmed);
      } catch {
        return fallback;
      }
    };

    // 1. Fetch Admin Posts joined with Author (register) details
    let postsQuery = `
      SELECT 
        ap.id AS _id,
        ap.userId,
        ap.content,
        ap.language,
        ap.tagIds,
        ap.courseType,
        ap.mediaFiles,
        ap.views,
        ap.likes,
        ap.likeCount,
        ap.created_at AS createdAt,
        ap.updated_at AS updatedAt,
        r.id AS authorId,
        r.username AS authorUsername,
        r.mobile AS authorMobile,
        r.role AS authorRole,
        r.courseType AS authorCourseType,
        r.language AS authorLanguage
      FROM adminposts ap
      LEFT JOIN register r ON ap.userId = r.id
    `;

    const queryParams = [];

    if (formattedLang) {
      postsQuery += ` WHERE ap.language = ? OR r.language = ?`;
      queryParams.push(formattedLang, formattedLang);
    }

    postsQuery += ` ORDER BY ap.created_at DESC`;

    const [postRows] = await db.execute(postsQuery, queryParams);

    if (postRows.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const postIds = postRows.map((p) => p._id);
    const authorIds = [
      ...new Set(postRows.map((p) => p.userId).filter(Boolean)),
    ];

    // 2. Batch fetch Author Profile Images from personaldetails
    let authorProfileMap = {};
    if (authorIds.length > 0) {
      const [profiles] = await db.query(
        `SELECT userId, profileImage, language, created_at FROM personaldetails WHERE userId IN (?)`,
        [authorIds],
      );

      profiles.forEach((p) => {
        if (
          !authorProfileMap[p.userId] ||
          (p.profileImage && p.profileImage.trim() !== "")
        ) {
          authorProfileMap[p.userId] = p.profileImage || "";
        }
      });
    }

    // 3. Batch fetch Comments & Comment Author details for these posts
    const [commentRows] = await db.query(
      `
      SELECT 
        ac.id AS _id,
        ac.postId,
        ac.userId,
        ac.content,
        ac.parentId,
        ac.created_at AS createdAt,
        r.username AS commenterUsername,
        pd.profileImage AS commenterProfileImage
      FROM admincomments ac
      LEFT JOIN register r ON ac.userId = r.id
      LEFT JOIN personaldetails pd ON ac.userId = pd.userId
      WHERE ac.postId IN (?)
      ORDER BY ac.created_at ASC
      `,
      [postIds],
    );

    // Group comments by postId
    const commentsByPostId = {};
    commentRows.forEach((c) => {
      if (!commentsByPostId[c.postId]) {
        commentsByPostId[c.postId] = [];
      }

      commentsByPostId[c.postId].push({
        _id: c._id,
        content: c.content,
        parentId: c.parentId || null,
        createdAt: c.createdAt,
        userId: {
          _id: c.userId,
          username: c.commenterUsername || "",
          profileImage: c.commenterProfileImage || "",
        },
      });
    });

    // 4. Assemble final posts data structure with nested replies
    const posts = postRows.map((post) => {
      // Use safe JSON parsing for stored database values
      const mediaFiles = safeJsonParse(post.mediaFiles, []);
      const tagIds = safeJsonParse(post.tagIds, []);
      const likes = safeJsonParse(post.likes, []);
      const courseType = safeJsonParse(post.courseType, []);

      const rawComments = commentsByPostId[post._id] || [];

      // Separate parent comments and nest replies
      const parentComments = rawComments.filter((c) => !c.parentId);
      const allComments = parentComments.map((parent) => ({
        _id: parent._id,
        content: parent.content,
        createdAt: parent.createdAt,
        userId: parent.userId,
        replies: rawComments.filter(
          (c) => String(c.parentId) === String(parent._id),
        ),
      }));

      return {
        _id: post._id,
        content: post.content,
        language: post.language,
        tagIds,
        courseType,
        mediaFiles,
        views: post.views || 0,
        likes,
        likeCount: post.likeCount || 0,
        commentCount: rawComments.length,
        allComments,
        userId: {
          _id: post.authorId,
          username: post.authorUsername || "",
          mobile: post.authorMobile || "",
          role: post.authorRole || "",
          courseType: post.authorCourseType || "",
          language: post.authorLanguage || "",
          profileImage: authorProfileMap[post.userId] || "",
        },
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
    });

    return res.status(200).json({ success: true, data: posts });
  } catch (error) {
    console.error("Error fetching admin posts:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// app.get("/api/admin-posts/admin/:adminId", async (req, res) => {
//   try {
//     const { adminId } = req.params; // Fixed: Destructure adminId to match route path

//     if (!mongoose.Types.ObjectId.isValid(adminId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid admin ID format",
//       });
//     }

//     const posts = await AdminPost.aggregate([
//       // 1. Filter posts matching the specific adminId
//       {
//         $match: {
//           userId: new mongoose.Types.ObjectId(adminId),
//         },
//       },
//       // 2. Join comments from 'admincomments' collection using string equality
//       {
//         $lookup: {
//           from: "admincomments",
//           let: { postId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [{ $toString: "$postId" }, { $toString: "$$postId" }],
//                 },
//               },
//             },
//           ],
//           as: "allComments",
//         },
//       },
//       // 3. Add comment count
//       {
//         $addFields: {
//           commentCount: { $size: "$allComments" },
//         },
//       },
//       // 4. Remove heavy raw comments array
//       {
//         $project: {
//           allComments: 0,
//         },
//       },
//       { $sort: { createdAt: -1 } },
//     ]);

//     return res.status(200).json({
//       success: true,
//       count: posts.length,
//       data: posts,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// });

// app.get("/api/admin-posts/admin/:adminId", async (req, res) => {
//   try {
//     const { adminId } = req.params; // Fixed: Destructure adminId to match route path

//     if (!mongoose.Types.ObjectId.isValid(adminId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid admin ID format",
//       });
//     }

//     const posts = await AdminPost.aggregate([
//       // 1. Filter posts matching the specific adminId
//       {
//         $match: {
//           userId: new mongoose.Types.ObjectId(adminId),
//         },
//       },
//       // 2. Join comments from 'admincomments' collection using string equality
//       {
//         $lookup: {
//           from: "admincomments",
//           let: { postId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [{ $toString: "$postId" }, { $toString: "$$postId" }],
//                 },
//               },
//             },
//           ],
//           as: "allComments",
//         },
//       },
//       // 3. Add comment count
//       {
//         $addFields: {
//           commentCount: { $size: "$allComments" },
//         },
//       },
//       // 4. Remove heavy raw comments array
//       {
//         $project: {
//           allComments: 0,
//         },
//       },
//       { $sort: { createdAt: -1 } },
//     ]);

//     return res.status(200).json({
//       success: true,
//       count: posts.length,
//       data: posts,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// });

app.get("/api/admin-posts/admin/:adminId", async (req, res) => {
  try {
    const { adminId } = req.params;

    const parsedAdminId = parseInt(adminId, 10);
    if (isNaN(parsedAdminId) || parsedAdminId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID format",
      });
    }

    const query = `
      SELECT 
        ap.id AS _id,
        ap.userId,
        ap.content,
        ap.language,
        ap.tagIds,
        ap.courseType,
        ap.mediaFiles,
        ap.views,
        ap.likes,
        ap.likeCount,
        ap.created_at AS createdAt,
        ap.updated_at AS updatedAt,
        COUNT(ac.id) AS commentCount
      FROM adminposts ap
      LEFT JOIN admincomments ac ON ap.id = ac.postId
      WHERE ap.userId = ?
      GROUP BY ap.id
      ORDER BY ap.created_at DESC
    `;

    const [rows] = await db.execute(query, [parsedAdminId]);

    const posts = rows.map((post) => {
      let mediaFiles = post.mediaFiles;
      let tagIds = post.tagIds;
      let likes = post.likes;
      let courseType = post.courseType;

      if (typeof mediaFiles === "string")
        mediaFiles = JSON.parse(mediaFiles || "[]");
      if (typeof tagIds === "string") tagIds = JSON.parse(tagIds || "[]");
      if (typeof likes === "string") likes = JSON.parse(likes || "[]");
      if (typeof courseType === "string")
        courseType = JSON.parse(courseType || "[]");

      return {
        _id: post._id,
        userId: post.userId,
        content: post.content,
        language: post.language,
        tagIds,
        courseType,
        mediaFiles,
        views: post.views || 0,
        likes,
        likeCount: post.likeCount || 0,
        commentCount: Number(post.commentCount),
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      count: posts.length,
      data: posts,
    });
  } catch (error) {
    console.error("Error fetching admin posts by adminId:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get("/api/admin-comments/post/:postId", async (req, res) => {
  try {
    const { postId } = req.params;

    // Populate userId to attach username, role, etc.
    const postComments = await AdminComment.find({ postId })
      .populate("userId", "username mobile role language")
      .sort({ createdAt: 1 })
      .lean();

    const parentComments = [];
    const repliesMap = {};

    postComments.forEach((c) => {
      if (!c.parentId) {
        parentComments.push({ ...c, replies: [] });
      } else {
        const pId = c.parentId.toString();
        if (!repliesMap[pId]) repliesMap[pId] = [];
        repliesMap[pId].push(c);
      }
    });

    // Nest replies into corresponding parent items
    const structuredComments = parentComments.map((parent) => ({
      ...parent,
      replies: repliesMap[parent._id.toString()] || [],
    }));
    // .reverse();

    return res.status(200).json({
      success: true,
      totalCount: postComments.length,
      comments: structuredComments,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching comments",
      error: error.message,
    });
  }
});
app.patch("/api/admin-posts/:postId/view", async (req, res) => {
  try {
    const { postId } = req.params;

    // Atomically increment view count by 1
    const updatedPost = await AdminPost.findByIdAndUpdate(
      postId,
      { $inc: { views: 1 } },
      // { new: true },
      { returnDocument: "after" },
    );

    if (!updatedPost) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    return res.status(200).json({
      success: true,
      views: updatedPost.views,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ----------------------------------------------------
// Toggles likes for a post by a given user
// ----------------------------------------------------
app.patch("/api/admin-posts/:postId/like", async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body; // Logged-in user's ID

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });
    }

    const post = await AdminPost.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // Check if the user has already liked this post
    const hasLiked = post.likes.includes(userId);

    let updatedPost;
    if (hasLiked) {
      // Remove user ID and decrement like count
      updatedPost = await AdminPost.findByIdAndUpdate(
        postId,
        {
          $pull: { likes: userId },
          $inc: { likeCount: -1 },
        },
        // { new: true },
        { returnDocument: "after" },
      );
    } else {
      // Add user ID and increment like count
      updatedPost = await AdminPost.findByIdAndUpdate(
        postId,
        {
          $addToSet: { likes: userId },
          $inc: { likeCount: 1 },
        },
        // { new: true },
        { returnDocument: "after" },
      );
    }

    return res.status(200).json({
      success: true,
      liked: !hasLiked,
      likeCount: updatedPost.likeCount,
      likes: updatedPost.likes,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// app.put("/api/admin-posts/:id", upload.array("newFiles"), async (req, res) => {
//   try {
//     const { content, userId, removedMediaIds, targetLanguage, language } =
//       req.body;
//     const post = await AdminPost.findById(req.params.id);

//     if (!post) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found" });
//     }

//     // 1. Author verification
//     const postUserId = post.userId ? post.userId.toString() : "";
//     const incomingUserId = userId ? userId.toString() : "";

//     if (!incomingUserId || postUserId !== incomingUserId) {
//       return res
//         .status(403)
//         .json({ success: false, message: "Unauthorized action" });
//     }

//     // 2. Update text content
//     if (content !== undefined) post.content = content;

//     // 3. Update language if route or form changed
//     const newLang = targetLanguage || language;
//     if (newLang) {
//       const lower = newLang.toLowerCase();
//       if (lower === "te" || lower === "telugu") post.language = "Telugu";
//       if (lower === "en" || lower === "english") post.language = "English";
//     }

//     // 4. Remove specified media files from disk & DB
//     if (removedMediaIds) {
//       let idsToDelete = [];
//       try {
//         // Handle array or JSON stringified array from FormData
//         idsToDelete =
//           typeof removedMediaIds === "string" && removedMediaIds.startsWith("[")
//             ? JSON.parse(removedMediaIds)
//             : Array.isArray(removedMediaIds)
//               ? removedMediaIds
//               : [removedMediaIds];
//       } catch (e) {
//         idsToDelete = [removedMediaIds];
//       }

//       post.mediaFiles = post.mediaFiles.filter((file) => {
//         if (idsToDelete.includes(file._id.toString())) {
//           const filePath = path.join(process.cwd(), file.path);
//           if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
//           return false;
//         }
//         return true;
//       });
//     }

//     // 5. Append new files
//     if (req.files && req.files.length > 0) {
//       const uploadedMedia = req.files.map((file) => ({
//         filename: file.originalname,
//         path: file.path,
//         mimetype: file.mimetype,
//         mediaType: file.mimetype.startsWith("image/")
//           ? "image"
//           : file.mimetype.startsWith("video/")
//             ? "video"
//             : "audio",
//       }));
//       post.mediaFiles.push(...uploadedMedia);
//     }

//     const updatedPost = await post.save();
//     return res.status(200).json({ success: true, data: updatedPost });
//   } catch (error) {
//     return res.status(500).json({ success: false, error: error.message });
//   }
// });

// app.put("/api/admin-posts/:id", async (req, res) => {
//   try {
//     const {
//       userId,
//       content,
//       tagIds,
//       fileLink,
//       fileLinks,
//       targetLanguage,
//       language,
//       removedMediaIds,
//     } = req.body;

//     // 1. Fetch admin post to update
//     const post = await AdminPost.findById(req.params.id);
//     if (!post) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found" });
//     }

//     // 2. Fetch editor user details
//     const author = await User.findById(userId);
//     if (!author) {
//       return res.status(404).json({
//         success: false,
//         message: "User making the edit not found in database.",
//       });
//     }

//     // 3. Authorization check
//     const isOwner = post.userId
//       ? post.userId.toString() === author._id.toString()
//       : false;
//     const isAdmin = author.role === "admin";

//     if (!isOwner && !isAdmin) {
//       return res
//         .status(403)
//         .json({ success: false, message: "Unauthorized action" });
//     }

//     // 4. Update text content & language preferences
//     if (content !== undefined) post.content = content;

//     const newLang = targetLanguage || language;
//     if (newLang) {
//       const lower = newLang.toLowerCase();
//       if (lower === "te" || lower === "telugu") post.language = "Telugu";
//       if (lower === "en" || lower === "english") post.language = "English";
//     }

//     if (tagIds !== undefined) {
//       try {
//         post.tagIds = typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
//       } catch (e) {
//         post.tagIds = [];
//       }
//     }

//     // 5. Remove specified media files from AWS S3 Bucket & MongoDB array
//     if (removedMediaIds) {
//       let idsToDelete = [];
//       try {
//         idsToDelete =
//           typeof removedMediaIds === "string"
//             ? JSON.parse(removedMediaIds)
//             : removedMediaIds;
//       } catch (e) {
//         idsToDelete = Array.isArray(removedMediaIds)
//           ? removedMediaIds
//           : [removedMediaIds];
//       }

//       const formattedIds = idsToDelete.map((id) => id.toString());

//       // Filter and delete removed files from AWS S3
//       const updatedMediaFiles = [];
//       for (const file of post.mediaFiles) {
//         if (formattedIds.includes(file._id.toString())) {
//           const s3Key = getS3KeyFromUrl(file.fileLink);
//           if (s3Key) {
//             try {
//               await s3.send(
//                 new DeleteObjectCommand({
//                   Bucket: process.env.AWS_BUCKET_NAME,
//                   Key: s3Key,
//                 }),
//               );
//               console.log(`Successfully deleted S3 key: ${s3Key}`);
//             } catch (s3Err) {
//               console.error(`Failed to delete S3 key (${s3Key}):`, s3Err);
//             }
//           }
//         } else {
//           updatedMediaFiles.push(file);
//         }
//       }

//       post.mediaFiles = updatedMediaFiles;
//     }

//     // 6. Append new S3 media URLs if provided
//     const rawLinks = fileLinks
//       ? Array.isArray(fileLinks)
//         ? fileLinks
//         : [fileLinks]
//       : fileLink
//         ? [fileLink]
//         : [];

//     const newUploadedMedia = rawLinks
//       .filter((link) => typeof link === "string" && link.trim() !== "")
//       .map((link) => ({
//         fileLink: link.trim(),
//         mediaType: getMediaTypeFromUrl(link),
//       }));

//     if (newUploadedMedia.length > 0) {
//       post.mediaFiles.push(...newUploadedMedia);
//     }

//     const updatedPost = await post.save();

//     return res.status(200).json({
//       success: true,
//       message: "Admin post updated successfully",
//       data: updatedPost,
//     });
//   } catch (error) {
//     console.error("Error updating admin post:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });

// sql
app.put("/api/admin-posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      userId,
      content,
      tagIds,
      fileLink,
      fileLinks,
      targetLanguage,
      language,
      removedMediaIds,
    } = req.body;

    // 1. Fetch admin post to update from MySQL
    const [posts] = await db.execute(
      "SELECT id, userId, content, language, tagIds, mediaFiles FROM adminposts WHERE id = ?",
      [id],
    );

    if (!posts || posts.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    const post = posts[0];

    // 2. Fetch editor user details
    const [users] = await db.execute(
      "SELECT id, role, language FROM register WHERE id = ?",
      [userId],
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User making the edit not found in database.",
      });
    }

    const author = users[0];

    // 3. Authorization check
    const isOwner = post.userId
      ? String(post.userId) === String(author.id)
      : false;
    const isAdmin =
      String(author.role || "")
        .toLowerCase()
        .trim() === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });
    }

    // Parse existing JSON structures stored in MySQL
    let currentTagIds = [];
    try {
      currentTagIds =
        typeof post.tagIds === "string"
          ? JSON.parse(post.tagIds || "[]")
          : post.tagIds || [];
    } catch {
      currentTagIds = [];
    }

    let currentMediaFiles = [];
    try {
      currentMediaFiles =
        typeof post.mediaFiles === "string"
          ? JSON.parse(post.mediaFiles || "[]")
          : post.mediaFiles || [];
    } catch {
      currentMediaFiles = [];
    }

    // 4. Update text content & language preferences
    let updatedContent = content !== undefined ? content : post.content;
    let updatedLanguage = post.language;

    const newLang = targetLanguage || language;
    if (newLang) {
      const lower = newLang.toLowerCase();
      if (lower === "te" || lower === "telugu") updatedLanguage = "Telugu";
      else if (lower === "en" || lower === "english")
        updatedLanguage = "English";
      else updatedLanguage = newLang;
    }

    if (tagIds !== undefined) {
      try {
        currentTagIds =
          typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
      } catch {
        currentTagIds = [];
      }
    }

    // 5. Detect media removal request from frontend payload
    let isRemovalRequested = false;

    if (removedMediaIds) {
      let parsedRemoved = [];
      try {
        parsedRemoved =
          typeof removedMediaIds === "string"
            ? JSON.parse(removedMediaIds)
            : removedMediaIds;
      } catch {
        parsedRemoved = [removedMediaIds];
      }

      // Check if removedMediaIds array contains null, undefined, or "null" string
      if (Array.isArray(parsedRemoved)) {
        isRemovalRequested = parsedRemoved.some(
          (val) => val === null || val === undefined || val === "null",
        );
      }
    }

    // Also trigger removal if fileLink is explicitly passed as empty string or null
    if (fileLink === "" || fileLink === null) {
      isRemovalRequested = true;
    }

    const updatedMediaFiles = [];

    // Process existing media files stored in MySQL
    for (const file of currentMediaFiles) {
      const currentUrl = String(file.fileLink || file.url || "").trim();

      if (isRemovalRequested) {
        // Delete file from AWS S3
        const s3Key = getS3KeyFromUrl(currentUrl);
        if (s3Key) {
          try {
            await s3.send(
              new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: s3Key,
              }),
            );
            console.log(`Successfully deleted S3 key: ${s3Key}`);
          } catch (s3Err) {
            console.error(`Failed to delete S3 key (${s3Key}):`, s3Err);
          }
        }
        // Excluded from updatedMediaFiles (removes from MySQL JSON array)
      } else {
        // Keep file if no removal was requested
        updatedMediaFiles.push(file);
      }
    }

    currentMediaFiles = updatedMediaFiles;

    // 6. Append new S3 media URLs if provided as non-empty strings
    const rawLinks = fileLinks
      ? Array.isArray(fileLinks)
        ? fileLinks
        : [fileLinks]
      : fileLink
        ? [fileLink]
        : [];

    const newUploadedMedia = rawLinks
      .filter((link) => typeof link === "string" && link.trim() !== "")
      .map((link, idx) => ({
        id: Date.now() + idx,
        _id: String(Date.now() + idx),
        fileLink: link.trim(),
        mediaType: getMediaTypeFromUrl(link.trim()),
      }));

    if (newUploadedMedia.length > 0) {
      currentMediaFiles.push(...newUploadedMedia);
    }

    // 7. Execute UPDATE in MySQL for adminposts table
    await db.execute(
      `UPDATE adminposts 
       SET content = ?, language = ?, tagIds = ?, mediaFiles = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        updatedContent,
        updatedLanguage,
        JSON.stringify(currentTagIds),
        JSON.stringify(currentMediaFiles),
        id,
      ],
    );

    // 8. Fetch and return updated post record
    const [updatedRows] = await db.execute(
      "SELECT * FROM adminposts WHERE id = ?",
      [id],
    );

    return res.status(200).json({
      success: true,
      message: "Admin post updated successfully",
      data: {
        ...updatedRows[0],
        tagIds: currentTagIds,
        mediaFiles: currentMediaFiles,
      },
    });
  } catch (error) {
    console.error("Error updating admin post:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// app.delete("/api/admin-posts/:id", async (req, res) => {
//   try {
//     // Read userId flexibly regardless of casing
//     const userId = req.query.userid || req.query.userId;
//     const { id } = req.params;

//     const post = await AdminPost.findById(id);

//     if (!post) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found" });
//     }

//     // 1. Authorization check
//     const postUserId = post.userId ? post.userId.toString() : "";
//     const incomingUserId = userId ? userId.toString() : "";

//     if (!incomingUserId || postUserId !== incomingUserId) {
//       return res
//         .status(403)
//         .json({ success: false, message: "Unauthorized action" });
//     }

//     // 2. Delete media files asynchronously
//     if (post.mediaFiles && post.mediaFiles.length > 0) {
//       await Promise.all(
//         post.mediaFiles.map(async (file) => {
//           if (!file.path) return;
//           const filePath = path.join(process.cwd(), file.path);
//           try {
//             await fs.unlink(filePath);
//           } catch (fileErr) {
//             console.warn(
//               `File cleanup skipped for ${filePath}:`,
//               fileErr.message,
//             );
//           }
//         }),
//       );
//     }

//     // 3. Cascade delete associated comments & notifications
//     await Promise.all([
//       AdminPost.findByIdAndDelete(id),
//       Comment.deleteMany({ postId: id }),
//       Notification.deleteMany({ postId: id }),
//     ]);

//     return res.status(200).json({
//       success: true,
//       message: "Post, media, and related data deleted successfully",
//     });
//   } catch (error) {
//     console.error("Error deleting post:", error);
//     return res.status(500).json({ success: false, error: error.message });
//   }
// });

// app.delete("/api/admin-posts/:id", async (req, res) => {
//   try {
//     // Read userId flexibly regardless of casing
//     const userId = req.query.userid || req.query.userId;
//     const { id } = req.params;

//     const post = await AdminPost.findById(id);

//     if (!post) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found" });
//     }

//     // 1. Authorization check
//     const postUserId = post.userId ? post.userId.toString() : "";
//     const incomingUserId = userId ? userId.toString() : "";

//     if (!incomingUserId || postUserId !== incomingUserId) {
//       return res
//         .status(403)
//         .json({ success: false, message: "Unauthorized action" });
//     }

//     // 2. Delete attached media files from AWS S3
//     if (post.mediaFiles && post.mediaFiles.length > 0) {
//       for (const file of post.mediaFiles) {
//         // Handle fileLink, url, or legacy path schema variants
//         const fileUrl = file.fileLink || file.url || file.path;
//         const s3Key = getS3KeyFromUrl(fileUrl);

//         if (s3Key) {
//           try {
//             await s3.send(
//               new DeleteObjectCommand({
//                 Bucket: process.env.AWS_BUCKET_NAME,
//                 Key: s3Key,
//               }),
//             );
//             console.log(`Successfully deleted S3 key: ${s3Key}`);
//           } catch (s3Err) {
//             console.error(`Failed to delete S3 key (${s3Key}):`, s3Err);
//           }
//         }
//       }
//     }

//     // 3. Cascade delete associated post document, comments & notifications
//     await Promise.all([
//       AdminPost.findByIdAndDelete(id),
//       Comment.deleteMany({ postId: id }),
//       Notification.deleteMany({ postId: id }),
//     ]);

//     return res.status(200).json({
//       success: true,
//       message:
//         "Admin post, S3 media, comments, and notifications deleted successfully",
//     });
//   } catch (error) {
//     console.error("Error deleting admin post:", error);
//     return res.status(500).json({ success: false, error: error.message });
//   }
// });

// sql
app.delete("/api/admin-posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Read userId flexibly from query parameters
    const userId = req.query.userid || req.query.userId;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    // 1. Fetch admin post details from MySQL
    const [posts] = await db.execute(
      "SELECT id, userId, mediaFiles FROM adminposts WHERE id = ?",
      [id],
    );

    if (!posts || posts.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    const post = posts[0];

    // 2. Fetch requesting user's details for authorization
    const [users] = await db.execute(
      "SELECT id, role FROM register WHERE id = ?",
      [userId],
    );

    if (!users || users.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const requester = users[0];

    // 3. Authorization check (Owner or Admin)
    const isOwner = post.userId
      ? String(post.userId) === String(requester.id)
      : false;
    const isAdmin =
      String(requester.role || "")
        .toLowerCase()
        .trim() === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });
    }

    // 4. Parse and delete attached media files from AWS S3
    let mediaFiles = [];
    try {
      mediaFiles =
        typeof post.mediaFiles === "string"
          ? JSON.parse(post.mediaFiles || "[]")
          : post.mediaFiles || [];
    } catch {
      mediaFiles = [];
    }

    if (Array.isArray(mediaFiles) && mediaFiles.length > 0) {
      for (const file of mediaFiles) {
        const fileUrl = file.fileLink || file.url || file.path;
        const s3Key = getS3KeyFromUrl(fileUrl);

        if (s3Key) {
          try {
            await s3.send(
              new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: s3Key,
              }),
            );
            console.log(`Successfully deleted S3 key: ${s3Key}`);
          } catch (s3Err) {
            console.error(`Failed to delete S3 key (${s3Key}):`, s3Err);
          }
        }
      }
    }

    // 5. Cascade delete associated records from MySQL tables
    await Promise.all([
      db.execute("DELETE FROM adminposts WHERE id = ?", [id]),
      db.execute("DELETE FROM admincomments WHERE postId = ?", [id]),
      db.execute("DELETE FROM notifications WHERE postId = ?", [id]),
    ]);

    return res.status(200).json({
      success: true,
      message:
        "Admin post, S3 media, comments, and notifications deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting admin post:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin-comments
// app.post("/api/admin-comments", async (req, res) => {
//   try {
//     const { postId, userId, content, parentId, username } = req.body;

//     if (!postId || !userId || !content?.trim() || !username?.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "postId, userId, username, and content are required fields.",
//       });
//     }

//     const newComment = await AdminComment.create({
//       postId,
//       userId,
//       username: username.trim(),
//       content: content.trim(),
//       parentId: parentId || null,
//     });

//     // Return lean object so frontend can attach properties cleanly
//     return res.status(201).json(newComment.toObject());
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Error submitting comment",
//       error: error.message,
//     });
//   }
// });

// app.get("/api/admin-comments/post/:postId", async (req, res) => {
//   try {
//     const { postId } = req.params;

//     // Fetch all comments and populate user details (username, profile details)
//     const postComments = await AdminComment.find({ postId })
//       .populate("userId", "username mobile role language") // Populates user info
//       .sort({ createdAt: 1 })
//       .lean();

//     const parentComments = [];
//     const repliesMap = {};

//     postComments.forEach((c) => {
//       // Fallback string conversion for parentId check
//       if (!c.parentId) {
//         parentComments.push({ ...c, replies: [] });
//       } else {
//         const pId = c.parentId.toString();
//         if (!repliesMap[pId]) repliesMap[pId] = [];
//         repliesMap[pId].push(c);
//       }
//     });

//     // Nest replies inside corresponding parent items
//     const structuredComments = parentComments
//       .map((parent) => ({
//         ...parent,
//         replies: repliesMap[parent._id.toString()] || [],
//       }))
//       .reverse();

//     return res.status(200).json({
//       success: true,
//       totalCount: postComments.length,
//       comments: structuredComments,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching comments",
//       error: error.message,
//     });
//   }
// });

// POST /api/admin-comments
// app.post("/api/admin-comments", async (req, res) => {
//   try {
//     const { postId, userId, content, parentId, username } = req.body;

//     if (!postId || !userId || !content?.trim() || !username?.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "postId, userId, username, and content are required fields.",
//       });
//     }

//     // 1. Fetch parent AdminPost to obtain its language context
//     const adminPost = await AdminPost.findById(postId).lean();
//     if (!adminPost) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Admin post not found." });
//     }

//     // 2. Fetch profile details matching user ID and post language
//     const profile = await mongoose
//       .model("PersonalDetails")
//       .findOne({
//         userId: new mongoose.Types.ObjectId(userId),
//         language: adminPost.language,
//       })
//       .lean();

//     // 3. Create admin comment
//     const newComment = await AdminComment.create({
//       postId,
//       userId,
//       username: username.trim(),
//       content: content.trim(),
//       parentId: parentId || null,
//     });

//     // 4. Return enriched comment with populated profile picture & user details
//     return res.status(201).json({
//       ...newComment.toObject(),
//       userId: {
//         _id: userId,
//         username: username.trim(),
//         profileImage: profile?.profileImage || "",
//       },
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Error submitting comment",
//       error: error.message,
//     });
//   }
// });

// app.post("/api/admin-comments", async (req, res) => {
//   try {
//     const { postId, userId, content, parentId, username } = req.body;

//     if (!postId || !userId || !content?.trim() || !username?.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "postId, userId, username, and content are required fields.",
//       });
//     }

//     // 1. Fetch parent AdminPost to obtain its language context
//     const adminPost = await AdminPost.findById(postId).lean();
//     if (!adminPost) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Admin post not found." });
//     }

//     const profile = await mongoose
//       .model("PersonalDetails")
//       .findOne({
//         userId: new mongoose.Types.ObjectId(userId),
//         language: adminPost.language,
//       })
//       .lean();

//     // 3. Create admin comment
//     const newComment = await AdminComment.create({
//       postId,
//       userId,
//       username: username.trim(),
//       content: content.trim(),
//       parentId: parentId || null,
//     });

//     const commentData = newComment.toObject();

//     // 4. Return enriched comment with guaranteed userId structure
//     return res.status(201).json({
//       ...commentData,
//       userId: {
//         _id: userId.toString(),
//         username: username.trim(),
//         profileImage: profile?.profileImage || "",
//       },
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Error submitting comment",
//       error: error.message,
//     });
//   }
// });

app.post("/api/admin-comments", async (req, res) => {
  try {
    const { postId, userId, content, parentId, username, language } = req.body;
    console.log("admin post comemnts language ", language);

    if (!postId || !userId || !content?.trim() || !username?.trim()) {
      return res.status(400).json({
        success: false,
        message: "postId, userId, username, and content are required fields.",
      });
    }

    // 1. Fetch parent AdminPost to obtain its language context and author
    const adminPost = await AdminPost.findById(postId).lean();
    if (!adminPost) {
      return res
        .status(404)
        .json({ success: false, message: "Admin post not found." });
    }

    // Extract post language (defaults to "English" if unspecified)
    const postLanguage = language;

    // 2. Fetch commenter profile picture for current post language
    const profile = await mongoose
      .model("PersonalDetails")
      .findOne({
        userId: new mongoose.Types.ObjectId(userId),
        language: postLanguage,
      })
      .lean();

    // 3. Create admin comment
    const newComment = await AdminComment.create({
      postId,
      userId,
      username: username.trim(),
      content: content.trim(),
      parentId: parentId || null,
    });

    const commentData = newComment.toObject();

    const targetUsers = await User.find({
      _id: { $ne: new mongoose.Types.ObjectId(userId) }, // Exclude commenter
      $or: [
        { language: postLanguage }, // All users in that language group
        { role: "admin" }, // All admins (overrides language filter)
      ],
    }).select("_id");

    if (targetUsers.length > 0) {
      const notifications = targetUsers.map((recipient) => ({
        recipient: recipient._id,
        sender: userId,
        postId: adminPost._id,
        postModel: "AdminPost",
        commentId: newComment._id,
        postContentSnippet: content.trim(),
        type: "comment",
        language: postLanguage,
        isRead: false,
      }));

      await Notification.insertMany(notifications);
    }

    // 5. Return enriched comment
    return res.status(201).json({
      ...commentData,
      userId: {
        _id: userId.toString(),
        username: username.trim(),
        profileImage: profile?.profileImage || "",
      },
    });
  } catch (error) {
    console.error("Error submitting comment:", error);
    return res.status(500).json({
      success: false,
      message: "Error submitting comment",
      error: error.message,
    });
  }
});

// GET /api/admin-comments/post/:postId
app.get("/api/admin-comments/post/:postId", async (req, res) => {
  try {
    const { postId } = req.params;

    // 1. Fetch parent AdminPost to obtain language context
    const adminPost = await AdminPost.findById(postId).lean();
    if (!adminPost) {
      return res
        .status(404)
        .json({ success: false, message: "Admin post not found." });
    }

    // 2. Aggregate admin comments and attach language-matched profileImage
    const postComments = await AdminComment.aggregate([
      {
        $match: {
          postId: new mongoose.Types.ObjectId(postId),
        },
      },
      // Join User details from registration collection
      {
        $lookup: {
          from: "register",
          let: { commentUserId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    { $toString: "$_id" },
                    { $toString: "$$commentUserId" },
                  ],
                },
              },
            },
          ],
          as: "author",
        },
      },
      {
        $unwind: {
          path: "$author",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Join PersonalDetails matching user ID AND post language
      {
        $lookup: {
          from: "personaldetails",
          let: {
            authorId: "$author._id",
            targetLang: adminPost.language,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        { $toString: "$userId" },
                        { $toString: "$$authorId" },
                      ],
                    },
                    { $eq: ["$language", "$$targetLang"] },
                  ],
                },
              },
            },
          ],
          as: "authorProfile",
        },
      },
      // Shape response object
      {
        $project: {
          _id: 1,
          postId: 1,
          content: 1,
          parentId: 1,
          createdAt: 1,
          userId: {
            _id: "$author._id",
            username: { $ifNull: ["$author.username", "$username"] },
            profileImage: {
              $ifNull: [
                { $arrayElemAt: ["$authorProfile.profileImage", 0] },
                "",
              ],
            },
          },
        },
      },
      { $sort: { createdAt: 1 } },
    ]);

    // 3. Build parent-reply comment hierarchy
    const parentComments = [];
    const repliesMap = {};

    postComments.forEach((c) => {
      if (!c.parentId) {
        parentComments.push({ ...c, replies: [] });
      } else {
        const pId = c.parentId.toString();
        if (!repliesMap[pId]) repliesMap[pId] = [];
        repliesMap[pId].push(c);
      }
    });

    // Nest replies under parent comments and arrange latest parent first
    const structuredComments = parentComments
      .map((parent) => ({
        ...parent,
        replies: repliesMap[parent._id.toString()] || [],
      }))
      .reverse();

    return res.status(200).json({
      success: true,
      totalCount: postComments.length,
      comments: structuredComments,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching comments",
      error: error.message,
    });
  }
});

// GET: Filter support team members by language
app.get("/api/support-team", async (req, res) => {
  try {
    const { language } = req.query;
    const formattedLang = language;

    const filter = {};
    if (formattedLang) {
      filter.language = formattedLang;
    }

    const members = await SupportTeam.find(filter).sort({ createdAt: -1 });
    return res
      .status(200)
      .json({ success: true, count: members.length, data: members });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Create a new support team member with language
app.post("/api/support-team", async (req, res) => {
  try {
    const { name, role, avatar, phone, email, available, language } = req.body;
    const formattedLang = language;

    if (!name || !role || !phone || !email || !formattedLang) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields missing, including language ('English' or 'Telugu').",
      });
    }

    const newMember = await SupportTeam.create({
      name,
      role,
      avatar,
      phone,
      email,
      available,
      language: formattedLang,
    });

    return res.status(201).json({ success: true, data: newMember });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT: Update support team member
app.put("/api/support-team/:id", async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.language) {
      updateData.language = updateData.language;
    }

    const updatedMember = await SupportTeam.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true },
    );

    if (!updatedMember) {
      return res
        .status(404)
        .json({ success: false, message: "Member not found." });
    }

    return res.status(200).json({ success: true, data: updatedMember });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE: Remove support team member
app.delete("/api/support-team/:id", async (req, res) => {
  try {
    const deletedMember = await SupportTeam.findByIdAndDelete(req.params.id);
    if (!deletedMember) {
      return res
        .status(404)
        .json({ success: false, message: "Member not found." });
    }
    return res
      .status(200)
      .json({ success: true, message: "Member deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// -----------------------------------------------------------------------------
// GET: Fetch Personal Details by User ID & Language
// -----------------------------------------------------------------------------
// app.get("/api/personal-details/:userId", async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const language = req.query.language;

//     const details = await PersonalDetails.findOne({ userId, language });

//     return res.status(200).json({
//       success: true,
//       data: details || null, // Returns null if no record exists yet
//     });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

app.get("/api/personal-details/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { language } = req.query;

    // 1. Validate integer userId format
    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    // 2. Build dynamic SQL query based on presence of language query param
    let query = "SELECT * FROM personaldetails WHERE userId = ?";
    const queryParams = [parsedUserId];

    if (language) {
      query += " AND language = ?";
      queryParams.push(language);
    }

    // Limit to 1 row to mimic Mongoose findOne()
    query += " LIMIT 1";

    const [rows] = await db.execute(query, queryParams);

    // 3. Return object if found, otherwise null
    const details = rows.length > 0 ? rows[0] : null;

    // Map database column names to match MongoDB field naming if applicable
    if (details) {
      details._id = details.id;
      details.createdAt = details.created_at;
      details.updatedAt = details.updated_at;
    }

    return res.status(200).json({
      success: true,
      data: details,
    });
  } catch (error) {
    console.error("Error fetching personal details:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// app.put("/api/personal-details/:userId", async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const { name, aboutYou, gender, birthday, language } = req.body;
//     const formattedLang = language;

//     // 1. Update PersonalDetails document
//     const updatedDetails = await PersonalDetails.findOneAndUpdate(
//       { userId, language: formattedLang },
//       { name, aboutYou, gender, birthday, language: formattedLang },
//       { returnDocument: "after", runValidators: true, upsert: true },
//     );

//     // 2. Update the username in the User model if provided
//     if (name) {
//       await User.findByIdAndUpdate(
//         userId,
//         { username: name },
//         { runValidators: true },
//       );
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Personal details updated successfully",
//       data: updatedDetails,
//     });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

app.put("/api/personal-details/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, aboutYou, gender, birthday, language } = req.body;

    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const formattedLang = language || "";

    // 1. Perform UPSERT on personaldetails using ON DUPLICATE KEY UPDATE
    const upsertDetailsQuery = `
      INSERT INTO personaldetails (userId, name, aboutYou, gender, birthday, language)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        aboutYou = VALUES(aboutYou),
        gender = VALUES(gender),
        birthday = VALUES(birthday),
        updated_at = CURRENT_TIMESTAMP
    `;

    await db.execute(upsertDetailsQuery, [
      parsedUserId,
      name || null,
      aboutYou || null,
      gender || null,
      birthday || null,
      formattedLang,
    ]);

    // 2. Sync updated name to the register (User) table if provided
    if (name) {
      await db.execute(`UPDATE register SET username = ? WHERE id = ?`, [
        name,
        parsedUserId,
      ]);
    }

    // 3. Fetch updated record to return in response
    const [rows] = await db.execute(
      `SELECT * FROM personaldetails WHERE userId = ? AND language = ?`,
      [parsedUserId, formattedLang],
    );

    return res.status(200).json({
      success: true,
      message: "Personal details updated successfully",
      data: rows[0] || null,
    });
  } catch (error) {
    console.error("Error updating personal details:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});
// -----------------------------------------------------------------------------
// app.put("/api/personal-details/:userId/profile-image", async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const { profileImage, language } = req.body;
//     const targetLanguage = language || req.query.language;

//     // Extract new image URL (supports mediaLink or profileImage payload key)
//     const newImageUrl = profileImage;

//     if (
//       !newImageUrl ||
//       typeof newImageUrl !== "string" ||
//       !newImageUrl.trim()
//     ) {
//       return res
//         .status(400)
//         .json({ success: false, message: "No S3 media URL provided" });
//     }

//     if (!targetLanguage) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Language parameter is required" });
//     }

//     // 1. Fetch existing details document to check for old S3 image deletion
//     const existingDetails = await PersonalDetails.findOne({
//       userId,
//       language: targetLanguage,
//     });

//     if (existingDetails && existingDetails.profileImage) {
//       const s3Key = getS3KeyFromUrl(existingDetails.profileImage);
//       if (s3Key) {
//         try {
//           await s3.send(
//             new DeleteObjectCommand({
//               Bucket: process.env.AWS_BUCKET_NAME,
//               Key: s3Key,
//             }),
//           );
//           console.log(
//             `Successfully deleted old profile image S3 key: ${s3Key}`,
//           );
//         } catch (s3Err) {
//           console.error(`Failed to delete old S3 image key (${s3Key}):`, s3Err);
//         }
//       }
//     }

//     // 2. Update/upsert the document with new S3 URL
//     const updatedDetails = await PersonalDetails.findOneAndUpdate(
//       { userId, language: targetLanguage },
//       {
//         $set: {
//           profileImage: newImageUrl.trim(),
//           language: targetLanguage,
//         },
//       },
//       { returnDocument: "after", runValidators: true, upsert: true },
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Profile image updated successfully",
//       data: updatedDetails,
//     });
//   } catch (error) {
//     console.error("Error updating profile image:", error);
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

app.put("/api/personal-details/:userId/profile-image", async (req, res) => {
  try {
    const { userId } = req.params;
    const { profileImage, language } = req.body;
    const targetLanguage = language || req.query.language;

    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const newImageUrl = profileImage;

    if (
      !newImageUrl ||
      typeof newImageUrl !== "string" ||
      !newImageUrl.trim()
    ) {
      return res
        .status(400)
        .json({ success: false, message: "No S3 media URL provided" });
    }

    if (!targetLanguage) {
      return res
        .status(400)
        .json({ success: false, message: "Language parameter is required" });
    }

    const cleanImageUrl = newImageUrl.trim();

    // 1. Fetch existing record to check for old S3 image cleanup
    const [existingRows] = await db.execute(
      `SELECT profileImage FROM personaldetails WHERE userId = ? AND language = ?`,
      [parsedUserId, targetLanguage],
    );

    if (existingRows.length > 0 && existingRows[0].profileImage) {
      const oldImageUrl = existingRows[0].profileImage;
      const s3Key = getS3KeyFromUrl(oldImageUrl);

      if (s3Key) {
        try {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: s3Key,
            }),
          );
          console.log(
            `Successfully deleted old profile image S3 key: ${s3Key}`,
          );
        } catch (s3Err) {
          console.error(`Failed to delete old S3 image key (${s3Key}):`, s3Err);
        }
      }
    }

    // 2. Perform UPSERT with ON DUPLICATE KEY UPDATE
    const upsertQuery = `
      INSERT INTO personaldetails (userId, language, profileImage)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        profileImage = VALUES(profileImage),
        updated_at = CURRENT_TIMESTAMP
    `;

    await db.execute(upsertQuery, [
      parsedUserId,
      targetLanguage,
      cleanImageUrl,
    ]);

    // 3. Fetch updated record to maintain return payload contract
    const [updatedRows] = await db.execute(
      `SELECT * FROM personaldetails WHERE userId = ? AND language = ?`,
      [parsedUserId, targetLanguage],
    );

    return res.status(200).json({
      success: true,
      message: "Profile image updated successfully",
      data: updatedRows[0] || null,
    });
  } catch (error) {
    console.error("Error updating profile image:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});
// -----------------------------------------------------------------------------
// DELETE: Delete Profile Image
// -----------------------------------------------------------------------------
// app.delete("/api/personal-details/:userId/profile-image", async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const language = req.query.language;

//     const details = await PersonalDetails.findOne({ userId, language });

//     if (!details || !details.profileImage) {
//       return res
//         .status(400)
//         .json({ success: false, message: "No profile image to delete" });
//     }

//     // Delete image file from storage disk
//     const fileName = details.profileImage.split("/uploads/").pop();
//     if (fileName) {
//       const filePath = path.join(process.cwd(), "uploads", fileName);
//       if (fs.existsSync(filePath)) {
//         fs.unlinkSync(filePath);
//       }
//     }

//     details.profileImage = "";
//     await details.save();

//     return res.status(200).json({
//       success: true,
//       message: "Profile image deleted successfully",
//       data: details,
//     });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

app.delete("/api/personal-details/:userId/profile-image", async (req, res) => {
  try {
    const { userId } = req.params;
    const { language } = req.query;

    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    if (!language) {
      return res.status(400).json({
        success: false,
        message: "Language query parameter is required",
      });
    }

    // 1. Fetch user record to check for an existing profile image
    const [rows] = await db.execute(
      `SELECT * FROM personaldetails WHERE userId = ? AND language = ?`,
      [parsedUserId, language],
    );

    if (rows.length === 0 || !rows[0].profileImage) {
      return res
        .status(400)
        .json({ success: false, message: "No profile image to delete" });
    }

    const currentDetails = rows[0];

    // 2. Delete the physical image file from storage disk if it exists
    const fileName = currentDetails.profileImage.split("/uploads/").pop();
    if (fileName) {
      const filePath = path.join(process.cwd(), "uploads", fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // 3. Clear the profileImage column in the database
    await db.execute(
      `UPDATE personaldetails 
       SET profileImage = '', updated_at = CURRENT_TIMESTAMP 
       WHERE userId = ? AND language = ?`,
      [parsedUserId, language],
    );

    // 4. Return updated details record
    const updatedDetails = {
      ...currentDetails,
      profileImage: "",
    };

    return res.status(200).json({
      success: true,
      message: "Profile image deleted successfully",
      data: updatedDetails,
    });
  } catch (error) {
    console.error("Error deleting profile image:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// app.get("/api/admin-profile", async (req, res) => {
//   try {
//     const adminDetails = await User.aggregate([
//       // 1. Filter users where role is 'admin'
//       {
//         $match: {
//           role: "admin",
//         },
//       },
//       // 2. Lookup PersonalDetails matching by userId
//       {
//         $lookup: {
//           from: "personaldetails", // Collection name in MongoDB
//           let: { adminUserId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [
//                     { $toString: "$userId" },
//                     { $toString: "$$adminUserId" },
//                   ],
//                 },
//               },
//             },
//             // Sort to prioritize documents that have a profileImage, then by latest creation
//             {
//               $addFields: {
//                 hasImage: {
//                   $cond: [
//                     {
//                       $and: [
//                         { $ne: ["$profileImage", null] },
//                         { $ne: ["$profileImage", ""] },
//                       ],
//                     },
//                     1,
//                     0,
//                   ],
//                 },
//               },
//             },
//             { $sort: { hasImage: -1, createdAt: -1 } },
//           ],
//           as: "profileDetails",
//         },
//       },
//       // 3. Format the final output structure
//       {
//         $project: {
//           _id: 1,
//           username: 1,
//           mobile: 1,
//           role: 1,
//           courseType: 1,
//           language: 1,
//           profileImage: {
//             $ifNull: [
//               { $arrayElemAt: ["$profileDetails.profileImage", 0] },
//               "",
//             ],
//           },
//         },
//       },
//     ]);

//     if (!adminDetails || adminDetails.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "No admin found",
//       });
//     }

//     // Returns array of admins (or single object using adminDetails[0] if expecting 1 admin)
//     return res.status(200).json({
//       success: true,
//       data: adminDetails,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching admin profile",
//       error: error.message,
//     });
//   }
// });

// app.get("/api/admin-profile", async (req, res) => {
//   try {
//     // 1. Join 'register' (User table) with 'personaldetails'
//     // Order by non-empty profileImage first, then latest record per admin
//     const query = `
//       SELECT
//         u.id AS _id,
//         u.username,
//         u.mobile,
//         u.role,
//         u.courseType,
//         u.language,
//         COALESCE(pd.profileImage, '') AS profileImage
//       FROM register u
//       LEFT JOIN personaldetails pd ON u.id = pd.userId
//       WHERE u.role = 'admin'
//       ORDER BY
//         (pd.profileImage IS NOT NULL AND pd.profileImage != '') DESC,
//         pd.created_at DESC
//     `;

//     const [rows] = await db.execute(query);

//     if (!rows || rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "No admin found",
//       });
//     }

//     // 2. Deduplicate rows to return only 1 profile per admin (mimicking Mongoose arrayElemAt)
//     const adminMap = new Map();

//     for (const row of rows) {
//       if (!adminMap.has(row._id)) {
//         let parsedCourseType = row.courseType;
//         if (typeof parsedCourseType === "string") {
//           try {
//             parsedCourseType = JSON.parse(parsedCourseType || "[]");
//           } catch {
//             parsedCourseType = [row.courseType];
//           }
//         }

//         adminMap.set(row._id, {
//           _id: row._id,
//           username: row.username || "",
//           mobile: row.mobile || "",
//           role: row.role || "",
//           courseType: parsedCourseType || [],
//           language: row.language || "",
//           profileImage: row.profileImage || "",
//         });
//       }
//     }

//     const adminDetails = Array.from(adminMap.values());

//     return res.status(200).json({
//       success: true,
//       data: adminDetails,
//     });
//   } catch (error) {
//     console.error("Error fetching admin profile:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching admin profile",
//       error: error.message,
//     });
//   }
// });

app.get("/api/admin-profile", async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id AS _id,
        u.username,
        u.mobile,
        u.role,
        u.courseType,
        u.language,
        COALESCE(pd.profileImage, '') AS profileImage
      FROM register u
      LEFT JOIN personaldetails pd ON u.id = pd.userId
      WHERE LOWER(TRIM(u.role)) = 'admin'
      ORDER BY 
        (pd.profileImage IS NOT NULL AND pd.profileImage != '') DESC,
        pd.created_at DESC
    `;

    const [rows] = await db.execute(query);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No admin found",
      });
    }

    const adminMap = new Map();

    for (const row of rows) {
      if (!adminMap.has(row._id)) {
        let parsedCourseType = row.courseType;
        if (typeof parsedCourseType === "string") {
          try {
            parsedCourseType = JSON.parse(parsedCourseType || "[]");
          } catch {
            parsedCourseType = [row.courseType];
          }
        }

        adminMap.set(row._id, {
          _id: row._id,
          username: row.username || "",
          mobile: row.mobile || "",
          role: row.role || "",
          courseType: parsedCourseType || [],
          language: row.language || "",
          profileImage: row.profileImage || "",
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: Array.from(adminMap.values()),
    });
  } catch (error) {
    console.error("Error fetching admin profile:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching admin profile",
      error: error.message,
    });
  }
});

app.post("/api/media/upload-url", async (req, res) => {
  try {
    const { fileType, folder } = req.body;
    // fileType ex: 'image/jpeg', 'video/mp4', 'audio/mpeg'

    if (!fileType) {
      return res
        .status(400)
        .json({ success: false, message: "fileType is required" });
    }

    const { uploadUrl, fileUrl } = await generateUploadUrl(
      fileType,
      folder || "uploads",
    );

    return res.status(200).json({
      success: true,
      uploadUrl, // Used by Angular to PUT the file directly to S3
      fileUrl, // Saved to MySQL/MongoDB database
    });
  } catch (error) {
    console.error("S3 Presigned URL error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to generate upload URL" });
  }
});

// const upload = multer();

// Receive Large file and write in chunks to S3 bucket
// app.post("/api/upload_parallel", upload.single("file"), (req, res) => {
//   const file = req.file;
//   // params for s3 upload
//   const params = {
//     Bucket: bucketName,
//     Key: `${Date.now().toString()}_${file.originalname}`,
//     Body: file.buffer,
//   };

//   try {
//     // upload file to s3 parallelly in chunks
//     // it supports min 5MB of file size
//     const uploadParallel = new Upload({
//       client: s3,
//       queueSize: 4, // optional concurrency configuration
//       partSize: 5542880, // optional size of each part
//       leavePartsOnError: false, // optional manually handle dropped parts
//       params,
//     });

//     // checking progress of upload
//     uploadParallel.on("httpUploadProgress", (progress) => {
//       console.log(progress);
//     });

//     // after completion of upload
//     uploadParallel.done().then((data) => {
//       console.log("upload completed!", { data });
//       return res.json({ success: true, data: data.Location });
//     });
//   } catch (error) {
//     res.send({
//       success: false,
//       message: error.message,
//     });
//   }
// });

app.post("/api/upload_parallel", upload.single("file"), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res
      .status(400)
      .json({ success: false, message: "No file provided" });
  }

  // 1. Check for explicit folder passed via body or query parameters
  const requestedFolder = req.body.folder || req.query.folder;

  // Determine folder based on MIME type
  let folder = "others";
  if (requestedFolder === "courseThumbnail") {
    folder = "courseThumbnail";
  } else if (file.mimetype.startsWith("image/")) {
    folder = "images";
  } else if (file.mimetype.startsWith("video/")) {
    folder = "videos";
  } else if (file.mimetype.startsWith("audio/")) {
    folder = "audios";
  }

  // Construct Key with folder prefix
  const params = {
    Bucket: bucketName,
    Key: `${folder}/${Date.now().toString()}_${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype, // Recommended: preserves file viewer support in browser
  };

  try {
    const uploadParallel = new Upload({
      client: s3,
      queueSize: 4,
      partSize: 5542880,
      leavePartsOnError: false,
      params,
    });

    uploadParallel.on("httpUploadProgress", (progress) => {
      console.log(progress);
    });

    const data = await uploadParallel.done();
    console.log("upload completed!", { data });

    // Verify upload success by checking returned S3 Location URL
    return res.json({ success: true, data: data.Location });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Mount the course routes under the '/api/courses' prefix
app.use("/api/course", courseRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

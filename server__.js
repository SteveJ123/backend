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
import connectDB from "./config/db.js";
import Post from "./models/Post.js";
import User from "./models/User.js";
import Comment from "./models/Comment.js";
import Course from "./models/Course.js";
import Notification from "./models/Notification.js";

import upload from "./middleware/upload.js";
// Ensure 'uploads' directory exists
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Connect to MongoDB Atlas
connectDB();

// ----------------------------------------------------
// 1. REGISTER ENDPOINT
// ----------------------------------------------------
// app.post("/api/register", async (req, res) => {
//   try {
//     const { mobile, password, repassword } = req.body;

//     // Validate empty fields
//     if (!mobile || !password || !repassword) {
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     // Validate password match
//     if (password !== repassword) {
//       return res.status(400).json({ message: "Passwords do not match" });
//     }

//     // Check if user with mobile already exists
//     const existingUser = await User.findOne({ mobile });
//     if (existingUser) {
//       return res
//         .status(409)
//         .json({ message: "User already registered with this mobile number" });
//     }

//     // Hash password
//     const salt = await bcrypt.genSalt(10);
//     const passwordHash = await bcrypt.hash(password, salt);

//     // Save to MongoDB 'register' collection
//     const newUser = new User({
//       mobile,
//       passwordHash,
//     });

//     await newUser.save();

//     return res.status(201).json({
//       success: true,
//       message: "Registration successful!",
//     });
//   } catch (error) {
//     console.error("Registration Error:", error);
//     return res
//       .status(500)
//       .json({ message: "Server error during registration" });
//   }
// });

app.post("/api/register", async (req, res) => {
  try {
    const { username, mobile, password, repassword, courseType } = req.body;

    if (!username || !mobile || !password || !repassword || !courseType) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password !== repassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "User already registered with this mobile number" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Explicitly set role as 'user'
    const newUser = new User({
      username,
      mobile,
      passwordHash,
      role: "user",
      courseType,
    });

    await newUser.save();

    return res.status(201).json({
      success: true,
      message: "Registration successful!",
      user: {
        id: newUser._id,
        username: newUser.name,
        mobile: newUser.mobile,
        role: newUser.role,
        courseType: newUser.courseType,
      },
    });
  } catch (error) {
    console.error("Registration Error:", error);
    return res
      .status(500)
      .json({ message: "Server error during registration" });
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
// ----------------------------------------------------
// 2. LOGIN ENDPOINT
// ----------------------------------------------------
// app.post("/api/login", async (req, res) => {
//   try {
//     const { mobile, password } = req.body;

//     if (!mobile || !password) {
//       return res
//         .status(400)
//         .json({ message: "Mobile and password are required" });
//     }

//     // Find user by mobile number
//     const user = await User.findOne({ mobile });
//     if (!user) {
//       return res
//         .status(404)
//         .json({ message: "User not registered. Please sign up first." });
//     }

//     // Check password
//     const isMatch = await bcrypt.compare(password, user.passwordHash);
//     if (!isMatch) {
//       return res
//         .status(401)
//         .json({ message: "Invalid mobile number or password" });
//     }

//     // Generate JWT Token
//     const token = jwt.sign(
//       { userId: user._id, mobile: user.mobile },
//       "YOUR_JWT_SECRET_KEY",
//       { expiresIn: "1d" },
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Login successful!",
//       token,
//       user: { id: user._id, mobile: user.mobile },
//     });
//   } catch (error) {
//     console.error("Login Error:", error);
//     return res.status(500).json({ message: "Server error during login" });
//   }
// });

app.post("/api/login", async (req, res) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res
        .status(400)
        .json({ message: "Mobile and password are required" });
    }

    // Find user by mobile number
    const user = await User.findOne({ mobile });
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not registered. Please sign up first." });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Invalid mobile number or password" });
    }

    // Generate JWT Token (Includes user.role in payload)
    const token = jwt.sign(
      { userId: user._id, mobile: user.mobile, role: user.role },
      "YOUR_JWT_SECRET_KEY",
      { expiresIn: "1d" },
    );

    // Return success response with role
    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      id: user._id,
      role: user.role,
      username: user.username,
      courseType: user.courseType,
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Server error during login" });
  }
});

// API Endpoint: Handle Post Creation
// app.post("/api/posts", upload.array("files"), async (req, res) => {
//   try {
//     const { userId, content, tagIds, membershipIds, fileTypes } = req.body;

//     // Parse JSON strings sent from Angular FormData
//     const parsedTagIds = tagIds ? JSON.parse(tagIds) : [];
//     const parsedMembershipIds = membershipIds ? JSON.parse(membershipIds) : [];

//     // Normalize fileTypes (can be a string if 1 file, or an array if multiple)
//     const typesArray = Array.isArray(fileTypes)
//       ? fileTypes
//       : fileTypes
//         ? [fileTypes]
//         : [];

//     // Format uploaded files array
//     const mediaFiles = (req.files || []).map((file, index) => ({
//       filename: file.filename,
//       path: file.path,
//       mimetype: file.mimetype,
//       mediaType: typesArray[index] || "file",
//     }));

//     // Create and save database document
//     const newPost = new Post({
//       content,
//       tagIds: parsedTagIds,
//       membershipIds: parsedMembershipIds,
//       mediaFiles,
//     });

//     await newPost.save();

//     return res.status(201).json({
//       success: true,
//       message: "Post created successfully",
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

// app.post("/api/posts", upload.array("files"), async (req, res) => {
//   try {
//     // 1. Destructure userId from req.body
//     const { userId, content, tagIds, courseType, fileTypes, role } = req.body;

//     // Optional: Validate presence of userId early
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "userId is required to create a post.",
//       });
//     }

//     // Parse JSON strings sent from Angular FormData
//     const parsedTagIds = tagIds ? JSON.parse(tagIds) : [];
//     const parsedcourseType = courseType ? courseType : "";

//     // Normalize fileTypes (can be a string if 1 file, or an array if multiple)
//     const typesArray = Array.isArray(fileTypes)
//       ? fileTypes
//       : fileTypes
//         ? [fileTypes]
//         : [];

//     // Format uploaded files array
//     const mediaFiles = (req.files || []).map((file, index) => ({
//       filename: file.filename,
//       path: file.path,
//       mimetype: file.mimetype,
//       mediaType: typesArray[index] || "file",
//     }));

//     // 2. Pass userId into the new Post document
//     const newPost = new Post({
//       userId,
//       content,
//       tagIds: parsedTagIds,
//       courseType: parsedcourseType,
//       mediaFiles,
//     });

//     await newPost.save();

//     // 3. Determine target notification recipients
//     let recipientQuery = { _id: { $ne: userId } }; // Exclude author

//     if (role !== "admin") {
//       // Regular user: Only notify users with the exact same courseType
//       recipientQuery.courseType = courseType;
//     }
//     // Note: If author.role === 'admin', query stays { _id: { $ne: userId } }, targeting ALL users.

//     // const targetUsers = await User.find(recipientQuery).select("_id");
//     // 1. Find all users matching the author's courseType (EXCLUDING the author)
//     const targetUsers = await User.find({
//       _id: { $ne: userId },
//       courseType: courseType,
//     }).select("_id");

//     console.log("targetUsers", targetUsers);

//     // 4. Create and insert notification documents
//     if (targetUsers.length > 0) {
//       const notifications = targetUsers.map((user) => ({
//         recipient: user._id,
//         sender: userId,
//         postId: newPost._id,
//         postContentSnippet: content ? content.trim() : "Uploaded media post.",
//         isRead: false,
//       }));

//       await Notification.insertMany(notifications);
//     }

//     return res.status(201).json({
//       success: true,
//       message: "Post created successfully",
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

app.post("/api/posts", upload.array("files"), async (req, res) => {
  try {
    const { userId, content, tagIds, fileTypes } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required to create a post.",
      });
    }

    // 1. Fetch the actual user from MongoDB to get accurate role & courseType
    const author = await User.findById(userId);
    if (!author) {
      return res.status(404).json({
        success: false,
        message: "Post author not found in database.",
      });
    }

    // Parse JSON strings sent from Angular FormData
    const parsedTagIds = tagIds ? JSON.parse(tagIds) : [];

    // Normalize fileTypes array
    const typesArray = Array.isArray(fileTypes)
      ? fileTypes
      : fileTypes
        ? [fileTypes]
        : [];

    const mediaFiles = (req.files || []).map((file, index) => ({
      filename: file.filename,
      path: file.path,
      mimetype: file.mimetype,
      mediaType: typesArray[index] || "file",
    }));

    // 2. Create the post using the author's database courseType
    const newPost = new Post({
      userId,
      content,
      tagIds: parsedTagIds,
      courseType: author.courseType,
      mediaFiles,
    });

    await newPost.save();

    // // 1. Normalize courseType to ensure it's a plain string
    // const authorCourseType = Array.isArray(author.courseType)
    //   ? author.courseType[0]
    //   : author.courseType;
    // // 3. Build target recipients query
    // let recipientQuery = { _id: { $ne: author._id } };

    // if (author.role === "admin") {
    //   // If author is an admin, target ALL users (except author)
    //   recipientQuery = { _id: { $ne: author._id } };
    // } else {
    //   // If author is a regular user, target:
    //   // 1. Users with the same courseType OR
    //   // 2. Any user with role: "admin"
    //   recipientQuery.$or = [
    //     { courseType: authorCourseType },
    //     { role: "admin" },
    //   ];
    // }

    // // Find all matching target users
    // const targetUsers = await User.find(recipientQuery).select(
    //   "_id username courseType role",
    // );

    // console.log("Author Course Type:", author.courseType);
    // console.log("Author Role:", author.role);
    // console.log("Target Recipients Found:", targetUsers);

    // // 4. Bulk insert notification records
    // if (targetUsers.length > 0) {
    //   const notifications = targetUsers.map((user) => ({
    //     recipient: user._id,
    //     sender: author._id,
    //     postId: newPost._id,
    //     postContentSnippet: content ? content.trim() : "Uploaded media post.",
    //     isRead: false,
    //   }));

    //   await Notification.insertMany(notifications);

    // 3. Build target recipients query to match ALL users except the author
    // const recipientQuery = { _id: { $ne: author._id } };

    // // Find all matching target users
    // const targetUsers = await User.find(recipientQuery).select(
    //   "_id username courseType role",
    // );

    // console.log("Author Course Type:", author.courseType);
    // console.log("Author Role:", author.role);
    // console.log("Target Recipients Found:", targetUsers.length);

    // // 4. Bulk insert notification records
    // if (targetUsers.length > 0) {
    //   const notifications = targetUsers.map((user) => ({
    //     recipient: user._id,
    //     sender: author._id,
    //     postId: newPost._id,
    //     postContentSnippet: content ? content.trim() : "Uploaded media post.",
    //     isRead: false,
    //   }));

    //   await Notification.insertMany(notifications);

    // 3. Build target recipients query to match EVERY user in the collection except the post author
    const targetUsers = await User.find({
      _id: { $ne: author._id },
    }).select("_id");

    console.log(`Author ID: ${author._id}`);
    console.log(`Target Recipients Count: ${targetUsers.length}`);

    // 4. Bulk insert notification records for all recipients
    if (targetUsers.length > 0) {
      const notifications = targetUsers.map((user) => ({
        recipient: user._id,
        sender: author._id,
        postId: newPost._id,
        postContentSnippet: content ? content.trim() : "Uploaded media post.",
        isRead: false,
      }));

      await Notification.insertMany(notifications);
    }

    return res.status(201).json({
      success: true,
      message: "Post created and notifications queued successfully.",
      data: newPost,
    });
  } catch (error) {
    console.error("Error creating post:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});
// API Endpoint: Get All Posts
// app.get("/api/posts", async (req, res) => {
//   try {
//     const posts = await Post.find().sort({ createdAt: -1 });

//     return res.status(200).json({
//       success: true,
//       message: "Posts fetched successfully",
//       data: posts,
//     });
//   } catch (error) {
//     console.error("Error fetching posts:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });

// GET /api/posts
// app.get("/api/posts", async (req, res) => {
//   try {
//     const posts = await Post.aggregate([
//       // 1. Join comments from the "comments" collection where post._id matches comment.postId
//       {
//         $lookup: {
//           from: "comments",
//           let: { postIdStr: { $toString: "$_id" } }, // Converts ObjectId to String if needed
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $or: [
//                     { $eq: ["$postId", "$$postIdStr"] },
//                     { $eq: ["$postId", "$$postIdStr"] },
//                   ],
//                 },
//               },
//             },
//           ],
//           as: "allComments",
//         },
//       },
//       // 2. Add total comment count field
//       {
//         $addFields: {
//           commentCount: { $size: "$allComments" },
//         },
//       },
//       // 3. Remove raw allComments array to keep the initial post payload lightweight
//       {
//         $project: {
//           allComments: 0,
//         },
//       },
//       { $sort: { createdAt: -1 } },
//     ]);

//     return res.status(200).json({ success: true, data: posts });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

app.get("/api/posts", async (req, res) => {
  try {
    const posts = await Post.aggregate([
      // 1. Match post._id (ObjectId) directly with comment.postId (ObjectId)
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "postId",
          as: "allComments",
        },
      },
      // 2. Add total comment count field
      {
        $addFields: {
          commentCount: { $size: "$allComments" },
        },
      },
      // 3. Remove raw allComments array to keep the post response lightweight
      {
        $project: {
          allComments: 0,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return res.status(200).json({ success: true, data: posts });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/posts/user/:userId
app.get("/api/posts/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate if the userId string is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const posts = await Post.aggregate([
      // 1. Filter posts matching the specific userId
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
        },
      },
      // 2. Join comments from the "comments" collection where post._id matches comment.postId
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "postId",
          as: "allComments",
        },
      },
      // 3. Add total comment count field
      {
        $addFields: {
          commentCount: { $size: "$allComments" },
        },
      },
      // 4. Remove raw allComments array to keep the payload lightweight
      {
        $project: {
          allComments: 0,
        },
      },
      // 5. Sort posts from newest to oldest
      { $sort: { createdAt: -1 } },
    ]);

    return res.status(200).json({
      success: true,
      count: posts.length,
      data: posts,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/comments
app.post("/api/comments", async (req, res) => {
  try {
    const { postId, userId, content, parentId, username } = req.body;

    if (!postId || !userId || !content || !content.trim() || !username.trim()) {
      return res.status(400).json({
        success: false,
        message: "postId, userId, and content are required fields.",
      });
    }

    const newComment = await Comment.create({
      postId,
      userId,
      username,
      content: content.trim(),
      parentId: parentId || null,
    });

    return res.status(201).json(newComment);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error submitting comment", error: error.message });
  }
});

// GET /api/comments/post/:postId
app.get("/api/comments/post/:postId", async (req, res) => {
  try {
    const { postId } = req.params;

    // Fetch all comments belonging to the post
    const postComments = await Comment.find({ postId })
      .sort({ createdAt: -1 })
      .lean();

    const totalCount = postComments.length;
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

    const structuredComments = parentComments.map((parent) => ({
      ...parent,
      replies: repliesMap[parent._id.toString()] || [],
    }));

    return res.status(200).json({
      success: true,
      totalCount,
      comments: structuredComments,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching comments", error: error.message });
  }
});

// ----------------------------------------------------
// Increments post views
// ----------------------------------------------------
app.patch("/api/posts/:postId/view", async (req, res) => {
  try {
    const { postId } = req.params;

    // Atomically increment view count by 1
    const updatedPost = await Post.findByIdAndUpdate(
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
app.patch("/api/posts/:postId/like", async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body; // Logged-in user's ID

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });
    }

    const post = await Post.findById(postId);
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
      updatedPost = await Post.findByIdAndUpdate(
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
      updatedPost = await Post.findByIdAndUpdate(
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

// ==========================================
// 1. POST ROUTE: Create Course with Image Upload
// ==========================================
app.post("/api/courses", upload.single("thumbnail"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Thumbnail image file is required.",
      });
    }

    // Construct the image URL accessible via express.static('/uploads')
    const thumbnailUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

    const newCourse = new Course({
      title: req.body.title,
      description: req.body.description,
      instructor: req.body.instructor || "Pooja Agarwala",
      thumbnail: thumbnailUrl,
      // sectionsCount: Number(req.body.sectionsCount) || 1,
      // lecturesCount: Number(req.body.lecturesCount) || 1,
      isPaid: req.body.isPaid === "true",
      isNewCourse: req.body.isNewCourse === "true",
      // membershipType: req.body.membershipType || "Standard",
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
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while creating course",
    });
  }
});

// ==========================================
// 2. GET ROUTE: Fetch Courses from MongoDB
// ==========================================
app.get("/api/courses", async (req, res) => {
  try {
    const { search, status, isPaid } = req.query;
    let filterQuery = {};

    if (search) {
      filterQuery.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (status && status !== "all") {
      filterQuery.status = status;
    }

    if (isPaid !== undefined && isPaid !== "") {
      filterQuery.isPaid = isPaid === "true";
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

// GET: Fetch Personal Details
app.get("/api/personal-details", async (req, res) => {
  try {
    // Fetch details (returns first document or defaults)
    let details = await PersonalDetails.findOne();
    if (!details) {
      details = await PersonalDetails.create({
        name: "Legala Manjula",
        gender: "Female",
      });
    }
    return res.status(200).json({ success: true, data: details });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Save/Update Personal Details
app.post("/api/personal-details", async (req, res) => {
  try {
    const { name, aboutYou, gender, birthday } = req.body;

    let details = await PersonalDetails.findOne();
    if (details) {
      details.name = name ?? details.name;
      details.aboutYou = aboutYou ?? details.aboutYou;
      details.gender = gender ?? details.gender;
      details.birthday = birthday ?? details.birthday;
      await details.save();
    } else {
      details = await PersonalDetails.create({
        name,
        aboutYou,
        gender,
        birthday,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Personal details updated successfully",
      data: details,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications for a specific recipient user
 * @access  Private (Pass recipient userId via query params or auth middleware)
 */
// app.get("/api/notifications", async (req, res) => {
//   try {
//     // Get logged-in user ID from query param or authentication middleware (req.user._id)
//     const { userId } = req.query;

//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "userId query parameter is required.",
//       });
//     }

//     // Fetch notifications matching recipient, sorted by most recent first
//     const notifications = await Notification.find({ recipient: userId })
//       .populate("sender", "username courseType") // Populates sender username from User model
//       .populate("postId", "content mediaFiles") // Populates referenced Post details
//       .sort({ createdAt: -1 });

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
    const { userId } = req.query;
    console.log("userId", userId);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId query parameter is required.",
      });
    }

    // 1. Fetch logged-in user details to get their courseType and role
    const currentUser = await User.findById(userId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // 2. Fetch notifications for this user, populating sender and post details
    const notifications = await Notification.find({ recipient: userId })
      .populate("sender", "username courseType role")
      .populate("postId", "content mediaFiles courseType")
      .sort({ createdAt: -1 });

    console.log("notifications", notifications);

    // 3. Filter notifications matching the logged-in user's courseType OR sent by an Admin
    const courseSpecificNotifications = notifications.filter((notification) => {
      const senderRole = notification.sender?.role;
      const senderCourse = notification.sender?.courseType;

      // Allow if sender is admin OR sender has the same courseType as logged-in user
      return senderRole === "admin" || senderCourse === currentUser.courseType;
    });

    return res.status(200).json({
      success: true,
      count: courseSpecificNotifications.length,
      data: courseSpecificNotifications,
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
app.patch("/api/notifications/:id/read", async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

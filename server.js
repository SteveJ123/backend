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
import courseRoutes from "./routes/courseDetails.js"; // Adjust path according to your folder structure
import LiveSession from "./models/LiveSession.js";
import Product from "./models/Product.js";
import PersonalDetails from "./models/PersonalDetails.js";
import AdminPost from "./models/AdminPost.js";
import SupportTeam from "./models/SupportTeam.js";
import AdminComment from "./models/AdminComment.js";

import upload from "./middleware/upload.js";
// Ensure 'uploads' directory exists
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

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
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-language",
      "X-Language",
      "Accept",
    ],
    credentials: true,
    optionsSuccessStatus: 200, // Fixes issues with legacy browsers/proxies
  }),
);
// 3. Handle Preflight OPTIONS Requests explicitly
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Connect to MongoDB Atlas
connectDB();

app.post("/api/register", async (req, res) => {
  try {
    const { username, mobile, password, courseType, language, role } = req.body;

    // 1. Check if required fields are provided
    if (!username || !mobile || !password || !courseType || !language) {
      return res
        .status(400)
        .json({ message: "All required fields must be provided." });
    }

    // 2. Check if user with mobile already exists
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Mobile number is already registered." });
    }

    // 3. Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4. Create new user document
    const newUser = new User({
      username,
      mobile,
      passwordHash,
      courseType,
      language,
      role: role || "user", // Defaults to "user" unless specified
    });

    await newUser.save();

    res.status(201).json({
      message: "User registered successfully",
      userId: newUser._id,
    });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ message: "Server error during registration." });
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
// ----test----
// app.post("/api/login", async (req, res) => {
//   try {
//     const { mobile, password } = req.body;

//     if (!mobile || !password) {
//       return res
//         .status(400)
//         .json({ message: "Mobile and password are required" });
//     }

//     // 1. Find user in the 'register' collection by mobile number
//     const user = await User.findOne({ mobile });

//     if (!user) {
//       return res
//         .status(404)
//         .json({ message: "User not registered. Please sign up first." });
//     }

//     // 2. Check password
//     const isMatch = await bcrypt.compare(password, user.passwordHash);
//     if (!isMatch) {
//       return res
//         .status(401)
//         .json({ message: "Invalid mobile number or password" });
//     }

//     // 3. Generate JWT Token (MUST include user.language for downstream feed filtering)
//     const token = jwt.sign(
//       {
//         userId: user._id,
//         mobile: user.mobile,
//         role: user.role,
//         language: user.language, // Added language here
//       },
//       process.env.JWT_SECRET || "YOUR_JWT_SECRET_KEY",
//       { expiresIn: "1d" },
//     );

//     // 4. Return success response
//     return res.status(200).json({
//       success: true,
//       message: "Login successful!",
//       token,
//       id: user._id,
//       role: user.role,
//       username: user.username,
//       courseType: user.courseType,
//       language: user.language, // Fixed: dynamically reading from user document
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

    // 1. Find user in the 'register' collection by mobile number
    const user = await User.findOne({ mobile });

    if (!user) {
      return res
        .status(404)
        .json({ message: "User not registered. Please sign up first." });
    }

    // 2. Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Invalid mobile number or password" });
    }

    // // 3. Fetch user's profile image from PersonalDetails based on userId and language
    // const profile = await mongoose
    //   .model("PersonalDetails")
    //   .findOne({
    //     userId: user._id,
    //     language: user.language,
    //   })
    //   .lean();

    // const profileImage = profile?.profileImage || "";

    // 4. Generate JWT Token
    const token = jwt.sign(
      {
        userId: user._id,
        mobile: user.mobile,
        role: user.role,
        language: user.language,
        // profileImage,
      },
      process.env.JWT_SECRET || "YOUR_JWT_SECRET_KEY",
      { expiresIn: "1d" },
    );

    // 5. Return success response with profileImage
    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      id: user._id,
      role: user.role,
      username: user.username,
      courseType: user.courseType,
      language: user.language,
      // profileImage, // <--- Returns profile picture path or empty string
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Server error during login" });
  }
});

app.post("/api/posts", upload.array("files"), async (req, res) => {
  try {
    const { userId, content, tagIds, fileTypes, targetLanguage } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required to create a post.",
      });
    }

    // 1. Fetch the actual user from MongoDB to get accurate role, courseType & language
    const author = await User.findById(userId);
    if (!author) {
      return res.status(404).json({
        success: false,
        message: "Post author not found in database.",
      });
    }

    // Determine target post language:
    // If author is Admin, use the route language sent from frontend (targetLanguage).
    // If author is standard User, strictly enforce their account language.
    const postLanguage =
      author.role === "admin"
        ? targetLanguage || author.language
        : author.language;

    // Safely parse JSON strings sent from Angular FormData
    let parsedTagIds = [];
    if (tagIds) {
      try {
        parsedTagIds = typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
      } catch (e) {
        parsedTagIds = [];
      }
    }

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

    // 2. Create the post with language, courseType, and media
    const newPost = new Post({
      userId,
      content,
      tagIds: parsedTagIds,
      courseType: author.courseType,
      language: postLanguage, // <--- Language applied here
      mediaFiles,
    });

    await newPost.save();

    // 3. Build target recipients query matched strictly by POST LANGUAGE
    // Exclude author AND filter by matching language
    const targetUsers = await User.find({
      _id: { $ne: author._id },
      $or: [
        {
          language: postLanguage, // <--- Only notify users matching this post's language
        },
        {
          role: "admin",
        },
      ],
    }).select("_id");

    console.log(`Author ID: ${author._id} (${author.role})`);
    console.log(`Post Language: ${postLanguage}`);
    console.log(`Target Recipients Count: ${targetUsers.length}`);

    // 4. Bulk insert notification records for relevant recipients
    if (targetUsers.length > 0) {
      const notifications = targetUsers.map((user) => ({
        recipient: user._id,
        sender: author._id,
        postId: newPost._id,
        postModel: "Post",
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

// app.get("/api/posts", async (req, res) => {
//   try {
//     const { language } = req.query;

//     let formattedLang;
//     if (language) {
//       const lower = language.toLowerCase();
//       if (lower === "te" || lower === "telugu") formattedLang = "Telugu";
//       if (lower === "en" || lower === "english") formattedLang = "English";
//     }

//     const posts = await Post.aggregate([
//       // 1. Join user details safely (handles string vs objectId)
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

//       // 2. Filter by language match if query provided
//       ...(formattedLang
//         ? [{ $match: { "authorDetails.language": formattedLang } }]
//         : []),

//       // 3. Join comments collection
//       {
//         $lookup: {
//           from: "comments",
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

//       // 4. Attach author details object and comment count
//       {
//         $addFields: {
//           commentCount: { $size: "$allComments" },
//           userId: {
//             _id: "$authorDetails._id",
//             username: "$authorDetails.username",
//             mobile: "$authorDetails.mobile",
//             role: "$authorDetails.role",
//             courseType: "$authorDetails.courseType",
//             language: "$authorDetails.language",
//           },
//         },
//       },

//       // 5. Cleanup temporary arrays
//       {
//         $project: {
//           allComments: 0,
//           authorDetails: 0,
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
    const { language } = req.query;

    let formattedLang;
    if (language) {
      const lower = language.toLowerCase();
      if (lower === "te" || lower === "telugu") formattedLang = "Telugu";
      if (lower === "en" || lower === "english") formattedLang = "English";
    }

    const posts = await Post.aggregate([
      // 1. Join Post Author details safely
      {
        $lookup: {
          from: "register",
          let: { postUserId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$_id" }, { $toString: "$$postUserId" }],
                },
              },
            },
          ],
          as: "authorDetails",
        },
      },
      {
        $unwind: {
          path: "$authorDetails",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 2. Filter posts by language match if query provided
      // (Using $post.language directly or author language)
      ...(formattedLang
        ? [
            {
              $match: {
                $or: [
                  { language: formattedLang },
                  { "authorDetails.language": formattedLang },
                ],
              },
            },
          ]
        : []),

      // 3. Join Post Author's PersonalDetails by matching userId AND language
      {
        $lookup: {
          from: "personaldetails",
          let: {
            authorId: "$authorDetails._id",
            postLang: { $ifNull: ["$language", "$authorDetails.language"] },
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
                    { $eq: ["$language", "$$postLang"] },
                  ],
                },
              },
            },
          ],
          as: "authorProfile",
        },
      },

      // 4. Join comments collection AND populate each comment's author profile
      {
        $lookup: {
          from: "comments",
          let: {
            postId: "$_id",
            postLang: { $ifNull: ["$language", "$authorDetails.language"] },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$postId" }, { $toString: "$$postId" }],
                },
              },
            },
            // Join Comment Author User
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
                as: "commentAuthor",
              },
            },
            {
              $unwind: {
                path: "$commentAuthor",
                preserveNullAndEmptyArrays: true,
              },
            },
            // Join Comment Author's PersonalDetails matching post language
            {
              $lookup: {
                from: "personaldetails",
                let: {
                  commentAuthorId: "$commentAuthor._id",
                  targetLang: "$$postLang",
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          {
                            $eq: [
                              { $toString: "$userId" },
                              { $toString: "$$commentAuthorId" },
                            ],
                          },
                          { $eq: ["$language", "$$targetLang"] },
                        ],
                      },
                    },
                  },
                ],
                as: "commentAuthorProfile",
              },
            },
            // Structure Comment Object with Profile Image
            {
              $project: {
                _id: 1,
                content: 1,
                createdAt: 1,
                userId: {
                  _id: "$commentAuthor._id",
                  username: "$commentAuthor.username",
                  profileImage: {
                    $ifNull: [
                      {
                        $arrayElemAt: ["$commentAuthorProfile.profileImage", 0],
                      },
                      "",
                    ],
                  },
                },
              },
            },
          ],
          as: "allComments",
        },
      },

      // 5. Structure Post Output with author profileImage
      {
        $addFields: {
          commentCount: { $size: "$allComments" },
          userId: {
            _id: "$authorDetails._id",
            username: "$authorDetails.username",
            mobile: "$authorDetails.mobile",
            role: "$authorDetails.role",
            courseType: "$authorDetails.courseType",
            language: "$authorDetails.language",
            profileImage: {
              $ifNull: [
                { $arrayElemAt: ["$authorProfile.profileImage", 0] },
                "",
              ],
            },
          },
        },
      },

      // 6. Cleanup temp arrays
      {
        $project: {
          authorDetails: 0,
          authorProfile: 0,
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
// app.post("/api/comments", async (req, res) => {
//   try {
//     const { postId, userId, content, parentId, username } = req.body;

//     if (!postId || !userId || !content || !content.trim() || !username.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "postId, userId, and content are required fields.",
//       });
//     }

//     const newComment = await Comment.create({
//       postId,
//       userId,
//       username,
//       content: content.trim(),
//       parentId: parentId || null,
//     });

//     return res.status(201).json(newComment);
//   } catch (error) {
//     return res
//       .status(500)
//       .json({ message: "Error submitting comment", error: error.message });
//   }
// });

// // GET /api/comments/post/:postId
// app.get("/api/comments/post/:postId", async (req, res) => {
//   try {
//     const { postId } = req.params;

//     // Fetch all comments belonging to the post
//     const postComments = await Comment.find({ postId })
//       .sort({ createdAt: -1 })
//       .lean();

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

// POST /api/comments
app.post("/api/comments", async (req, res) => {
  try {
    const { postId, userId, content, parentId, username } = req.body;

    if (!postId || !userId || !content?.trim() || !username?.trim()) {
      return res.status(400).json({
        success: false,
        message: "postId, userId, content, and username are required fields.",
      });
    }

    // 1. Fetch parent post to check language context
    const post = await Post.findById(postId).lean();
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found." });
    }

    // 2. Fetch corresponding profile details for this user and language
    const profile = await mongoose
      .model("PersonalDetails")
      .findOne({
        userId: new mongoose.Types.ObjectId(userId),
        language: post.language,
      })
      .lean();

    // 3. Create comment
    const newComment = await Comment.create({
      postId,
      userId,
      username,
      content: content.trim(),
      parentId: parentId || null,
    });

    // 4. Return new comment enriched with user details
    return res.status(201).json({
      ...newComment.toObject(),
      userId: {
        _id: userId,
        username,
        profileImage: profile?.profileImage || "",
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error submitting comment", error: error.message });
  }
});

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
app.get("/api/comments/post/:postId", async (req, res) => {
  try {
    const { postId } = req.params;

    // 1. Fetch parent post to get language context
    const post = await Post.findById(postId).lean();
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found." });
    }

    // 2. Aggregate comments and attach matching language profileImage
    const postComments = await Comment.aggregate([
      {
        $match: {
          postId: new mongoose.Types.ObjectId(postId),
        },
      },
      // Join User details
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
            targetLang: post.language,
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
      // Shape comment output structure
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
      { $sort: { createdAt: -1 } },
    ]);

    // 3. Organize into parent comments and nested replies
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
app.post("/api/courses", upload.single("thumbnail"), async (req, res) => {
  try {
    const { title, description, instructor, isPaid, isNewCourse, language } =
      req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Thumbnail image file is required.",
      });
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid title. Must be 'Face Yoga' or 'Face Yoga + Raj Yoga'.",
      });
    }

    const formattedLang = language;
    if (!formattedLang) {
      return res.status(400).json({
        success: false,
        message: "Valid language ('English' or 'Telugu') is required.",
      });
    }

    const thumbnailUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

    const newCourse = new Course({
      title: title.trim(),
      description,
      instructor: instructor || "Pooja Agarwala",
      thumbnail: thumbnailUrl,
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
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while creating course",
    });
  }
});

// PUT: Admin update course
app.put("/api/courses/:id", upload.single("thumbnail"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    if (req.body.title !== undefined) course.title = req.body.title;
    if (req.body.description !== undefined)
      course.description = req.body.description;
    if (req.body.instructor !== undefined)
      course.instructor = req.body.instructor;
    if (req.body.status !== undefined) course.status = req.body.status;
    if (req.body.progress !== undefined)
      course.progress = Number(req.body.progress);

    if (req.body.language !== undefined) {
      course.language = req.body.language;
    }

    if (req.body.isPaid !== undefined) {
      course.isPaid = req.body.isPaid === "true" || req.body.isPaid === true;
    }
    if (req.body.isNewCourse !== undefined) {
      course.isNewCourse =
        req.body.isNewCourse === "true" || req.body.isNewCourse === true;
    }

    if (req.file) {
      if (course.thumbnail) {
        const oldFileName = course.thumbnail.split("/uploads/").pop();
        if (oldFileName) {
          const oldFilePath = path.join(process.cwd(), "uploads", oldFileName);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
      }
      course.thumbnail = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    }

    const updatedCourse = await course.save();

    return res.status(200).json({
      success: true,
      message: "Course updated successfully",
      data: updatedCourse,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while updating course",
    });
  }
});

// DELETE: Admin remove a course and its thumbnail image
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

app.get("/api/notifications", async (req, res) => {
  try {
    const { userId, language } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId query parameter is required.",
      });
    }

    // 1. Fetch user to check role
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // 2. Query notifications for the user
    let notifications = await Notification.find({ recipient: userId })
      .populate("sender", "username courseType role")
      .populate("postId", "content mediaFiles courseType language")
      .sort({ createdAt: -1 });

    // 3. Filter by language ONLY if the user is NOT an admin
    if (user.role !== "admin" && language) {
      const targetLang =
        language.toLowerCase() === "telugu" || language === "te"
          ? "Telugu"
          : "English";

      notifications = notifications.filter(
        (n) => !n.postId || n.postId.language === targetLang,
      );
    }

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

// UPDATE POST & MEDIA FILES
// app.put("/api/posts/:id", upload.array("newFiles"), async (req, res) => {
//   try {
//     // 1. Extract userId from req.body (or from req.user if using auth middleware)
//     const { content, userId, removedMediaIds } = req.body;
//     const post = await Post.findById(req.params.id);

//     if (!post) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Post not found" });
//     }

//     // 2. Normalize and compare post.userId with incoming userId
//     const postUserId = post.userId ? post.userId.toString() : "";
//     const incomingUserId = userId ? userId.toString() : "";

//     if (!incomingUserId || postUserId !== incomingUserId) {
//       return res
//         .status(403)
//         .json({ success: false, message: "Unauthorized action" });
//     }

//     // 3. Update text content
//     if (content !== undefined) post.content = content;

//     // 4. Remove specified media files from disk & database
//     if (removedMediaIds) {
//       const idsToDelete = Array.isArray(removedMediaIds)
//         ? removedMediaIds
//         : [removedMediaIds];

//       post.mediaFiles = post.mediaFiles.filter((file) => {
//         if (idsToDelete.includes(file._id.toString())) {
//           // Delete file physically from disk
//           const filePath = path.join(process.cwd(), file.path);
//           if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
//           return false;
//         }
//         return true;
//       });
//     }

//     // 5. Append newly uploaded media files
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

app.put("/api/posts/:id", upload.array("newFiles"), async (req, res) => {
  try {
    const {
      userId,
      content,
      tagIds,
      fileTypes,
      targetLanguage,
      removedMediaIds,
    } = req.body;

    // 1. Fetch post to update
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // 2. Fetch editor user to verify identity, role, and language settings
    const author = await User.findById(userId);
    if (!author) {
      return res.status(404).json({
        success: false,
        message: "User making the edit not found in database.",
      });
    }

    // 3. Authorization check: Ensure only post author or admin can update
    const isOwner = post.userId
      ? post.userId.toString() === author._id.toString()
      : false;
    const isAdmin = author.role === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });
    }

    // 4. Update core content fields
    if (content !== undefined) post.content = content;

    // Determine target post language update
    if (isAdmin && targetLanguage) {
      post.language = targetLanguage;
    } else if (author.language) {
      post.language = author.language;
    }

    // Safely parse JSON tagIds sent from Angular FormData
    if (tagIds !== undefined) {
      try {
        post.tagIds = typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
      } catch (e) {
        post.tagIds = [];
      }
    }

    // 5. Delete removed media files from disk & document array
    if (removedMediaIds) {
      let idsToDelete = [];
      try {
        idsToDelete =
          typeof removedMediaIds === "string"
            ? JSON.parse(removedMediaIds)
            : removedMediaIds;
      } catch (e) {
        idsToDelete = Array.isArray(removedMediaIds)
          ? removedMediaIds
          : [removedMediaIds];
      }

      post.mediaFiles = post.mediaFiles.filter((file) => {
        if (idsToDelete.includes(file._id.toString())) {
          const filePath = path.join(process.cwd(), file.path);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (err) {
              console.error(`Failed to delete file at ${filePath}:`, err);
            }
          }
          return false;
        }
        return true;
      });
    }

    // 6. Process newly uploaded media files with custom fileTypes
    if (req.files && req.files.length > 0) {
      const typesArray = Array.isArray(fileTypes)
        ? fileTypes
        : fileTypes
          ? [fileTypes]
          : [];

      const newUploadedMedia = req.files.map((file, index) => ({
        filename: file.filename,
        path: file.path,
        mimetype: file.mimetype,
        mediaType:
          typesArray[index] ||
          (file.mimetype.startsWith("image/")
            ? "image"
            : file.mimetype.startsWith("video/")
              ? "video"
              : "audio"),
      }));

      post.mediaFiles.push(...newUploadedMedia);
    }

    const updatedPost = await post.save();

    return res.status(200).json({
      success: true,
      message: "Post updated successfully",
      data: updatedPost,
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

// DELETE POST & ALL ASSOCIATED MEDIA
app.delete("/api/posts/:id", async (req, res) => {
  try {
    // Read userId from query params (handles both req.query.userId and req.query.userid)
    const userId = req.query.userid;
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // Compare string representations of the user IDs
    const postUserId = post.userId ? post.userId.toString() : "";
    const incomingUserId = userId ? userId.toString() : "";

    if (!incomingUserId || postUserId !== incomingUserId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });
    }

    // Delete attached media files from disk
    if (post.mediaFiles && post.mediaFiles.length > 0) {
      post.mediaFiles.forEach((file) => {
        const filePath = path.join(process.cwd(), file.path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }

    await Post.findByIdAndDelete(req.params.id);
    return res
      .status(200)
      .json({ success: true, message: "Post and media deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
// CREATE SESSION
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

    const newSession = new LiveSession({
      title,
      date,
      startTime,
      endTime,
      occurrence,
      linkTypeNote,
      meetingUrl,
      courseType,
      language: formattedLang,
    });

    const savedSession = await newSession.save();
    return res.status(201).json({ success: true, data: savedSession });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/session", async (req, res) => {
  try {
    const { language, courseType, role } = req.query;

    const filter = {};

    // 1. Language filter (applies to both Users and Admins)
    if (language) {
      const lower = language.toLowerCase();
      if (lower === "te" || lower === "telugu") filter.language = "Telugu";
      else if (lower === "en" || lower === "english")
        filter.language = "English";
      else filter.language = language;
    }

    // 2. CourseType filter (ONLY applied if user is NOT an admin)
    const isAdmin = role && role.toLowerCase() === "admin";
    if (!isAdmin && courseType) {
      filter.courseType = courseType;
    }

    const sessions = await LiveSession.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});
app.get("/api/session", async (req, res) => {
  try {
    const { language, courseType, role } = req.query;

    const filter = {};

    // 1. Language filter (applies to both Users and Admins)
    if (language) {
      const lower = language.toLowerCase();
      if (lower === "te" || lower === "telugu") filter.language = "Telugu";
      else if (lower === "en" || lower === "english")
        filter.language = "English";
      else filter.language = language;
    }

    // 2. CourseType filter (ONLY applied if user is NOT an admin)
    const isAdmin = role && role.toLowerCase() === "admin";
    if (!isAdmin && courseType) {
      filter.courseType = courseType;
    }

    const sessions = await LiveSession.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});
// UPDATE SESSION
app.put("/api/session/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.language) {
      updateData.language = updateData.language;
    }

    const updatedSession = await LiveSession.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!updatedSession) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found." });
    }

    return res.status(200).json({ success: true, data: updatedSession });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE SESSION
app.delete("/api/session/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSession = await LiveSession.findByIdAndDelete(id);

    if (!deletedSession) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found." });
    }

    return res
      .status(200)
      .json({ success: true, message: "Session deleted successfully." });
  } catch (error) {
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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
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

app.get("/api/leaderboard", async (req, res) => {
  try {
    const { lang } = req.query; // 'English' or 'Telugu'
    const now = new Date();

    // 1. Current Month Prefix (YYYY-MM)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const currentMonthPrefix = `${year}-${month}`;

    // 2. Current Week Bounds (Monday to Sunday)
    const currentDayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon...
    const distanceToMon = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;

    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMon);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startOfWeekStr = getFormattedDate(monday);
    const endOfWeekStr = getFormattedDate(sunday);

    // Base Filter for Language
    const matchStage = lang ? { language: lang } : {};

    const leaderboardData = await User.aggregate([
      { $match: matchStage },
      {
        $project: {
          username: 1,
          language: 1,
          points: 1,
          completedPracticeDates: 1,

          // Count entries in current month
          monthlyCount: {
            $size: {
              $filter: {
                input: { $ifNull: ["$completedPracticeDates", []] },
                as: "dateStr",
                cond: {
                  $eq: [
                    { $substrBytes: ["$$dateStr", 0, 7] },
                    currentMonthPrefix,
                  ],
                },
              },
            },
          },

          // Count entries in current week
          weeklyCount: {
            $size: {
              $filter: {
                input: { $ifNull: ["$completedPracticeDates", []] },
                as: "dateStr",
                cond: {
                  $and: [
                    { $gte: ["$$dateStr", startOfWeekStr] },
                    { $lte: ["$$dateStr", endOfWeekStr] },
                  ],
                },
              },
            },
          },
        },
      },
      {
        $facet: {
          // Top 4 All-Time (Sorted by total points)
          allTime: [{ $sort: { points: -1 } }, { $limit: 4 }],

          // Top 4 Monthly (Sorted by current month completed days, then total points)
          monthly: [{ $sort: { monthlyCount: -1, points: -1 } }, { $limit: 4 }],

          // Top 4 Weekly (Sorted by current week completed days, then total points)
          weekly: [{ $sort: { weeklyCount: -1, points: -1 } }, { $limit: 4 }],
        },
      },
    ]);

    const result = leaderboardData[0];

    return res.json({
      success: true,
      allTime: result.allTime || [],
      monthly: result.monthly || [],
      weekly: result.weekly || [],
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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

// app.post("/api/admin-posts", upload.array("files"), async (req, res) => {
//   try {
//     const { userId, content, tagIds, fileTypes, targetLanguage } = req.body;

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
//     // Falls back to Admin's registered language if targetLanguage isn't sent
//     const postLanguage = targetLanguage || author.language || "English";

//     // Parse JSON strings safely
//     let parsedTagIds = [];
//     if (tagIds) {
//       try {
//         parsedTagIds = typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
//       } catch (e) {
//         parsedTagIds = [];
//       }
//     }

//     const typesArray = Array.isArray(fileTypes)
//       ? fileTypes
//       : fileTypes
//         ? [fileTypes]
//         : [];

//     const mediaFiles = (req.files || []).map((file, index) => ({
//       filename: file.filename,
//       path: file.path,
//       mimetype: file.mimetype,
//       mediaType: typesArray[index] || "file",
//     }));

//     // 3. Save AdminPost with the designated language
//     const newPost = new AdminPost({
//       userId: author._id,
//       content,
//       language: postLanguage, // <--- Restricts post to this stream
//       tagIds: parsedTagIds,
//       courseType: author.courseType,
//       mediaFiles,
//     });

//     await newPost.save();

//     // 4. STRICT FILTER: Only fetch recipients whose language MATCHES postLanguage
//     const targetUsers = await User.find({
//       _id: { $ne: author._id },
//       language: postLanguage, // <--- Only notifies students in English or Telugu stream
//     }).select("_id");

//     console.log(`Admin Post Created for Stream: ${postLanguage}`);
//     console.log(`Notifying ${targetUsers.length} ${postLanguage} students.`);

//     // 5. Send notifications ONLY to matching students
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
//       // 1. Filter by language if provided
//       ...(formattedLang ? [{ $match: { language: formattedLang } }] : []),

//       // 2. Join with user collection (author of the post)
//       {
//         $lookup: {
//           from: "register", // Change to "register" if your MongoDB collection name is register
//           let: { authorId: "$userId" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [{ $toString: "$_id" }, { $toString: "$$authorId" }],
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

//       // 3. Join with admincomments
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

//       // 4. Add comment count and populated userId object
//       {
//         $addFields: {
//           commentCount: { $size: "$allComments" },
//           userId: {
//             _id: "$authorDetails._id",
//             username: "$authorDetails.username",
//             role: "$authorDetails.role",
//             language: "$authorDetails.language",
//           },
//         },
//       },

//       // 5. Cleanup temporary arrays and sort
//       {
//         $project: {
//           allComments: 0,
//           authorDetails: 0,
//         },
//       },
//       { $sort: { createdAt: -1 } },
//     ]);

//     return res.status(200).json({ success: true, data: posts });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// POST /api/admin-posts
app.post("/api/admin-posts", upload.array("files"), async (req, res) => {
  try {
    const { userId, content, tagIds, fileTypes, targetLanguage } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required to create a post.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId format provided.",
      });
    }

    // 1. Fetch Author (Admin)
    let author = await User.findById(userId);
    if (!author) {
      author = await User.findOne({ role: "admin" });
    }
    if (!author) {
      return res.status(404).json({
        success: false,
        message: "Post author not found in database.",
      });
    }

    // 2. Determine target language for the post
    const postLanguage = targetLanguage || author.language || "English";

    // Safely parse JSON strings sent from FormData
    let parsedTagIds = [];
    if (tagIds) {
      try {
        parsedTagIds = typeof tagIds === "string" ? JSON.parse(tagIds) : tagIds;
      } catch (e) {
        parsedTagIds = [];
      }
    }

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

    // 3. Save AdminPost with designated language
    const newPost = new AdminPost({
      userId: author._id,
      content,
      language: postLanguage,
      tagIds: parsedTagIds,
      courseType: author.courseType,
      mediaFiles,
    });

    await newPost.save();

    // 4. STRICT FILTER: Fetch recipients whose language matches postLanguage
    const targetUsers = await User.find({
      _id: { $ne: author._id },
      language: postLanguage,
    }).select("_id");

    console.log(`Admin Post Created for Stream: ${postLanguage}`);
    console.log(`Notifying ${targetUsers.length} ${postLanguage} students.`);

    // 5. Send notifications to matching students
    if (targetUsers.length > 0) {
      const notifications = targetUsers.map((user) => ({
        recipient: user._id,
        sender: author._id,
        postId: newPost._id,
        postModel: "AdminPost",
        postContentSnippet: content ? content.trim() : "Uploaded media post.",
        isRead: false,
      }));

      await Notification.insertMany(notifications);
    }

    return res.status(201).json({
      success: true,
      message: `Admin post published to ${postLanguage} students successfully.`,
      data: newPost,
    });
  } catch (error) {
    console.error("Error creating admin post:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// GET /api/admin-posts
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

//       // 3. Join Post Author's PersonalDetails by matching userId AND language
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
//                   $and: [
//                     {
//                       $eq: [
//                         { $toString: "$userId" },
//                         { $toString: "$$authorId" },
//                       ],
//                     },
//                     { $eq: ["$language", "$$postLang"] },
//                   ],
//                 },
//               },
//             },
//           ],
//           as: "authorProfile",
//         },
//       },

//       // 4. Join admincomments collection AND populate comment authors with profile images
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
//             // Join Comment Author's PersonalDetails matching post language
//             {
//               $lookup: {
//                 from: "personaldetails",
//                 let: {
//                   commentAuthorId: "$commentAuthor._id",
//                   targetLang: "$$postLang",
//                 },
//                 pipeline: [
//                   {
//                     $match: {
//                       $expr: {
//                         $and: [
//                           {
//                             $eq: [
//                               { $toString: "$userId" },
//                               { $toString: "$$commentAuthorId" },
//                             ],
//                           },
//                           { $eq: ["$language", "$$targetLang"] },
//                         ],
//                       },
//                     },
//                   },
//                 ],
//                 as: "commentAuthorProfile",
//               },
//             },
//             // Structure Comment Object with Profile Image
//             {
//               $project: {
//                 _id: 1,
//                 content: 1,
//                 createdAt: 1,
//                 userId: {
//                   _id: "$commentAuthor._id",
//                   username: "$commentAuthor.username",
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
//           as: "allComments",
//         },
//       },

//       // 5. Structure Admin Post Output with populated userId object & profileImage
//       {
//         $addFields: {
//           commentCount: { $size: "$allComments" },
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

//       // 6. Cleanup temp arrays and sort
//       {
//         $project: {
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

//       // 3. Join Post Author's PersonalDetails by userId (Prefer matching post lang, fallback to latest)
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
//               },
//             },
//             { $sort: { isLangMatch: -1, createdAt: -1 } },
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
//                   // Optional: Sort so if they have the post's language profile image, take that first, otherwise fall back to any available image
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
//             // Structure Comment Object with Profile Image
//             {
//               $project: {
//                 _id: 1,
//                 content: 1,
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
//           as: "allComments",
//         },
//       },

//       // 5. Structure Admin Post Output
//       {
//         $addFields: {
//           commentCount: { $size: "$allComments" },
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

//       // 6. Cleanup temp arrays and sort
//       {
//         $project: {
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

app.get("/api/admin-posts", async (req, res) => {
  try {
    const { language } = req.query;

    let formattedLang;
    if (language) {
      const lower = language.toLowerCase();
      if (lower === "te" || lower === "telugu") formattedLang = "Telugu";
      if (lower === "en" || lower === "english") formattedLang = "English";
    }

    const posts = await AdminPost.aggregate([
      // 1. Join Admin Post Author details safely
      {
        $lookup: {
          from: "register",
          let: { postUserId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$_id" }, { $toString: "$$postUserId" }],
                },
              },
            },
          ],
          as: "authorDetails",
        },
      },
      {
        $unwind: {
          path: "$authorDetails",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 2. Filter posts by language match if query provided
      ...(formattedLang
        ? [
            {
              $match: {
                $or: [
                  { language: formattedLang },
                  { "authorDetails.language": formattedLang },
                ],
              },
            },
          ]
        : []),

      // 3. Join Post Author's PersonalDetails by userId (Prefer post lang, fallback to any valid image)
      {
        $lookup: {
          from: "personaldetails",
          let: {
            authorId: "$authorDetails._id",
            postLang: { $ifNull: ["$language", "$authorDetails.language"] },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$userId" }, { $toString: "$$authorId" }],
                },
              },
            },
            {
              $addFields: {
                isLangMatch: {
                  $cond: [{ $eq: ["$language", "$$postLang"] }, 1, 0],
                },
                hasImage: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$profileImage", null] },
                        { $ne: ["$profileImage", ""] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
            { $sort: { isLangMatch: -1, hasImage: -1, createdAt: -1 } },
          ],
          as: "authorProfile",
        },
      },

      // 4. Join admincomments and match commenter profile strictly by userId
      {
        $lookup: {
          from: "admincomments",
          let: {
            postId: "$_id",
            postLang: { $ifNull: ["$language", "$authorDetails.language"] },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$postId" }, { $toString: "$$postId" }],
                },
              },
            },
            // Join Comment Author User
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
                as: "commentAuthor",
              },
            },
            {
              $unwind: {
                path: "$commentAuthor",
                preserveNullAndEmptyArrays: true,
              },
            },
            // Join Comment Author's PersonalDetails matching ONLY by userId
            {
              $lookup: {
                from: "personaldetails",
                let: {
                  commentAuthorId: {
                    $ifNull: ["$commentAuthor._id", "$userId"],
                  },
                  targetLang: "$$postLang",
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: [
                          { $toString: "$userId" },
                          { $toString: "$$commentAuthorId" },
                        ],
                      },
                    },
                  },
                  {
                    $addFields: {
                      isLangMatch: {
                        $cond: [{ $eq: ["$language", "$$targetLang"] }, 1, 0],
                      },
                      hasImage: {
                        $cond: [
                          {
                            $and: [
                              { $ne: ["$profileImage", null] },
                              { $ne: ["$profileImage", ""] },
                            ],
                          },
                          1,
                          0,
                        ],
                      },
                    },
                  },
                  { $sort: { isLangMatch: -1, hasImage: -1, createdAt: -1 } },
                ],
                as: "commentAuthorProfile",
              },
            },
            // Format comment object with profile image fallback
            {
              $project: {
                _id: 1,
                content: 1,
                parentId: 1,
                createdAt: 1,
                userId: {
                  _id: { $ifNull: ["$commentAuthor._id", "$userId"] },
                  username: {
                    $ifNull: ["$commentAuthor.username", "$username"],
                  },
                  profileImage: {
                    $ifNull: [
                      {
                        $arrayElemAt: ["$commentAuthorProfile.profileImage", 0],
                      },
                      "",
                    ],
                  },
                },
              },
            },
          ],
          as: "rawComments",
        },
      },

      // 5. Structure top-level comments and nest corresponding replies
      {
        $addFields: {
          commentCount: { $size: "$rawComments" },
          allComments: {
            $map: {
              input: {
                $filter: {
                  input: "$rawComments",
                  as: "c",
                  cond: {
                    $or: [
                      { $eq: ["$$c.parentId", null] },
                      { $eq: ["$$c.parentId", ""] },
                      { $not: ["$$c.parentId"] },
                    ],
                  },
                },
              },
              as: "parent",
              in: {
                _id: "$$parent._id",
                content: "$$parent.content",
                createdAt: "$$parent.createdAt",
                userId: "$$parent.userId",
                replies: {
                  $filter: {
                    input: "$rawComments",
                    as: "reply",
                    cond: {
                      $eq: [
                        { $toString: "$$reply.parentId" },
                        { $toString: "$$parent._id" },
                      ],
                    },
                  },
                },
              },
            },
          },
          userId: {
            _id: "$authorDetails._id",
            username: "$authorDetails.username",
            mobile: "$authorDetails.mobile",
            role: "$authorDetails.role",
            courseType: "$authorDetails.courseType",
            language: "$authorDetails.language",
            profileImage: {
              $ifNull: [
                { $arrayElemAt: ["$authorProfile.profileImage", 0] },
                "",
              ],
            },
          },
        },
      },

      // 6. Cleanup temp fields and sort
      {
        $project: {
          rawComments: 0,
          authorDetails: 0,
          authorProfile: 0,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return res.status(200).json({ success: true, data: posts });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/admin-posts/admin/:adminId", async (req, res) => {
  try {
    const { adminId } = req.params; // Fixed: Destructure adminId to match route path

    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID format",
      });
    }

    const posts = await AdminPost.aggregate([
      // 1. Filter posts matching the specific adminId
      {
        $match: {
          userId: new mongoose.Types.ObjectId(adminId),
        },
      },
      // 2. Join comments from 'admincomments' collection using string equality
      {
        $lookup: {
          from: "admincomments",
          let: { postId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$postId" }, { $toString: "$$postId" }],
                },
              },
            },
          ],
          as: "allComments",
        },
      },
      // 3. Add comment count
      {
        $addFields: {
          commentCount: { $size: "$allComments" },
        },
      },
      // 4. Remove heavy raw comments array
      {
        $project: {
          allComments: 0,
        },
      },
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

app.put("/api/admin-posts/:id", upload.array("newFiles"), async (req, res) => {
  try {
    const { content, userId, removedMediaIds, targetLanguage, language } =
      req.body;
    const post = await AdminPost.findById(req.params.id);

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // 1. Author verification
    const postUserId = post.userId ? post.userId.toString() : "";
    const incomingUserId = userId ? userId.toString() : "";

    if (!incomingUserId || postUserId !== incomingUserId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });
    }

    // 2. Update text content
    if (content !== undefined) post.content = content;

    // 3. Update language if route or form changed
    const newLang = targetLanguage || language;
    if (newLang) {
      const lower = newLang.toLowerCase();
      if (lower === "te" || lower === "telugu") post.language = "Telugu";
      if (lower === "en" || lower === "english") post.language = "English";
    }

    // 4. Remove specified media files from disk & DB
    if (removedMediaIds) {
      let idsToDelete = [];
      try {
        // Handle array or JSON stringified array from FormData
        idsToDelete =
          typeof removedMediaIds === "string" && removedMediaIds.startsWith("[")
            ? JSON.parse(removedMediaIds)
            : Array.isArray(removedMediaIds)
              ? removedMediaIds
              : [removedMediaIds];
      } catch (e) {
        idsToDelete = [removedMediaIds];
      }

      post.mediaFiles = post.mediaFiles.filter((file) => {
        if (idsToDelete.includes(file._id.toString())) {
          const filePath = path.join(process.cwd(), file.path);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          return false;
        }
        return true;
      });
    }

    // 5. Append new files
    if (req.files && req.files.length > 0) {
      const uploadedMedia = req.files.map((file) => ({
        filename: file.originalname,
        path: file.path,
        mimetype: file.mimetype,
        mediaType: file.mimetype.startsWith("image/")
          ? "image"
          : file.mimetype.startsWith("video/")
            ? "video"
            : "audio",
      }));
      post.mediaFiles.push(...uploadedMedia);
    }

    const updatedPost = await post.save();
    return res.status(200).json({ success: true, data: updatedPost });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/admin-posts/:id", async (req, res) => {
  try {
    // Read userId flexibly regardless of casing
    const userId = req.query.userid || req.query.userId;
    const { id } = req.params;

    const post = await AdminPost.findById(id);

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // 1. Authorization check
    const postUserId = post.userId ? post.userId.toString() : "";
    const incomingUserId = userId ? userId.toString() : "";

    if (!incomingUserId || postUserId !== incomingUserId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });
    }

    // 2. Delete media files asynchronously
    if (post.mediaFiles && post.mediaFiles.length > 0) {
      await Promise.all(
        post.mediaFiles.map(async (file) => {
          if (!file.path) return;
          const filePath = path.join(process.cwd(), file.path);
          try {
            await fs.unlink(filePath);
          } catch (fileErr) {
            console.warn(
              `File cleanup skipped for ${filePath}:`,
              fileErr.message,
            );
          }
        }),
      );
    }

    // 3. Cascade delete associated comments & notifications
    await Promise.all([
      AdminPost.findByIdAndDelete(id),
      Comment.deleteMany({ postId: id }),
      Notification.deleteMany({ postId: id }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Post, media, and related data deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting post:", error);
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
app.get("/api/personal-details/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const language = req.query.language;

    const details = await PersonalDetails.findOne({ userId, language });

    return res.status(200).json({
      success: true,
      data: details || null, // Returns null if no record exists yet
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// -----------------------------------------------------------------------------
// PUT: Save/Update Personal Text Details (Upsert)
// -----------------------------------------------------------------------------
app.put("/api/personal-details/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, aboutYou, gender, birthday, language } = req.body;
    const formattedLang = language;

    const updatedDetails = await PersonalDetails.findOneAndUpdate(
      { userId, language: formattedLang },
      { name, aboutYou, gender, birthday, language: formattedLang },
      { returnDocument: "after", runValidators: true, upsert: true },
    );

    return res.status(200).json({
      success: true,
      message: "Personal details updated successfully",
      data: updatedDetails,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// -----------------------------------------------------------------------------
// PUT: Upload/Update Profile Image
// -----------------------------------------------------------------------------
app.put(
  "/api/personal-details/:userId/profile-image",
  upload.single("image"),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const language = req.body.language || req.query.language;
      console.log("req.body.language", req.body.language);
      console.log("req.query.language", req.query.language);

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No image file provided" });
      }

      const imagePath = `/uploads/${req.file.filename}`;

      // Check existing document to clean up old image from storage
      const existingDetails = await PersonalDetails.findOne({
        userId,
        language,
      });
      if (existingDetails && existingDetails.profileImage) {
        const oldFileName = existingDetails.profileImage
          .split("/uploads/")
          .pop();
        if (oldFileName) {
          const oldFilePath = path.join(process.cwd(), "uploads", oldFileName);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
      }

      const updatedDetails = await PersonalDetails.findOneAndUpdate(
        { userId, language },
        { $set: { profileImage: imagePath, language } },
        { returnDocument: "after", runValidators: true, upsert: true },
      );

      return res.status(200).json({
        success: true,
        message: "Profile image uploaded successfully",
        data: updatedDetails,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

// -----------------------------------------------------------------------------
// DELETE: Delete Profile Image
// -----------------------------------------------------------------------------
app.delete("/api/personal-details/:userId/profile-image", async (req, res) => {
  try {
    const { userId } = req.params;
    const language = req.query.language;

    const details = await PersonalDetails.findOne({ userId, language });

    if (!details || !details.profileImage) {
      return res
        .status(400)
        .json({ success: false, message: "No profile image to delete" });
    }

    // Delete image file from storage disk
    const fileName = details.profileImage.split("/uploads/").pop();
    if (fileName) {
      const filePath = path.join(process.cwd(), "uploads", fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    details.profileImage = "";
    await details.save();

    return res.status(200).json({
      success: true,
      message: "Profile image deleted successfully",
      data: details,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/admin-profile", async (req, res) => {
  try {
    const adminDetails = await User.aggregate([
      // 1. Filter users where role is 'admin'
      {
        $match: {
          role: "admin",
        },
      },
      // 2. Lookup PersonalDetails matching by userId
      {
        $lookup: {
          from: "personaldetails", // Collection name in MongoDB
          let: { adminUserId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    { $toString: "$userId" },
                    { $toString: "$$adminUserId" },
                  ],
                },
              },
            },
            // Sort to prioritize documents that have a profileImage, then by latest creation
            {
              $addFields: {
                hasImage: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$profileImage", null] },
                        { $ne: ["$profileImage", ""] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
            { $sort: { hasImage: -1, createdAt: -1 } },
          ],
          as: "profileDetails",
        },
      },
      // 3. Format the final output structure
      {
        $project: {
          _id: 1,
          username: 1,
          mobile: 1,
          role: 1,
          courseType: 1,
          language: 1,
          profileImage: {
            $ifNull: [
              { $arrayElemAt: ["$profileDetails.profileImage", 0] },
              "",
            ],
          },
        },
      },
    ]);

    if (!adminDetails || adminDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No admin found",
      });
    }

    // Returns array of admins (or single object using adminDetails[0] if expecting 1 admin)
    return res.status(200).json({
      success: true,
      data: adminDetails,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching admin profile",
      error: error.message,
    });
  }
});

// Mount the course routes under the '/api/courses' prefix
app.use("/api/course", courseRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

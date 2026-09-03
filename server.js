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

// Middleware
app.use(cors());
app.use(express.json());
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

    // 3. Generate JWT Token (MUST include user.language for downstream feed filtering)
    const token = jwt.sign(
      {
        userId: user._id,
        mobile: user.mobile,
        role: user.role,
        language: user.language, // Added language here
      },
      process.env.JWT_SECRET || "YOUR_JWT_SECRET_KEY",
      { expiresIn: "1d" },
    );

    // 4. Return success response
    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      id: user._id,
      role: user.role,
      username: user.username,
      courseType: user.courseType,
      language: user.language, // Fixed: dynamically reading from user document
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
      language: postLanguage, // <--- Only notify users matching this post's language
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
//     const posts = await Post.aggregate([
//       // 1. Join with 'register' collection using userId
//       {
//         $lookup: {
//           from: "register", // Explicitly matches your User model's collection name
//           localField: "userId",
//           foreignField: "_id",
//           as: "authorDetails",
//         },
//       },
//       // 2. Flatten authorDetails array to a single object
//       {
//         $unwind: {
//           path: "$authorDetails",
//           preserveNullAndEmptyArrays: true, // Retain post if user is missing
//         },
//       },
//       // 3. Join with comments collection for comment count
//       {
//         $lookup: {
//           from: "comments",
//           localField: "_id",
//           foreignField: "postId",
//           as: "allComments",
//         },
//       },
//       // 4. Reshape userId with User schema fields and calculate comment count
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

// app.get("/api/posts", async (req, res) => {
//   try {
//     const { language } = req.query;

//     // Convert query param (e.g. 'english' or 'te') to exact DB casing ('English' / 'Telugu')
//     let formattedLang;
//     if (language) {
//       const lower = language.toLowerCase();
//       if (lower === "te" || lower === "telugu") formattedLang = "Telugu";
//       if (lower === "en" || lower === "english") formattedLang = "English";
//     }

//     const posts = await Post.aggregate([
//       {
//         $lookup: {
//           from: "register",
//           localField: "userId",
//           foreignField: "_id",
//           as: "authorDetails",
//         },
//       },
//       {
//         $unwind: {
//           path: "$authorDetails",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       // Match by exact language casing if specified
//       ...(formattedLang
//         ? [{ $match: { "authorDetails.language": formattedLang } }]
//         : []),

//       {
//         $lookup: {
//           from: "comments",
//           localField: "_id",
//           foreignField: "postId",
//           as: "allComments",
//         },
//       },
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
      // 1. Join user details safely (handles string vs objectId)
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

      // 2. Filter by language match if query provided
      ...(formattedLang
        ? [{ $match: { "authorDetails.language": formattedLang } }]
        : []),

      // 3. Join comments collection
      {
        $lookup: {
          from: "comments",
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

      // 4. Attach author details object and comment count
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
          },
        },
      },

      // 5. Cleanup temporary arrays
      {
        $project: {
          allComments: 0,
          authorDetails: 0,
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
// app.post("/api/courses", upload.single("thumbnail"), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: "Thumbnail image file is required.",
//       });
//     }

//     // Construct the image URL accessible via express.static('/uploads')
//     const thumbnailUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

//     const newCourse = new Course({
//       title: req.body.title,
//       description: req.body.description,
//       instructor: req.body.instructor || "Pooja Agarwala",
//       thumbnail: thumbnailUrl,
//       // sectionsCount: Number(req.body.sectionsCount) || 1,
//       // lecturesCount: Number(req.body.lecturesCount) || 1,
//       isPaid: req.body.isPaid === "true",
//       isNewCourse: req.body.isNewCourse === "true",
//       // membershipType: req.body.membershipType || "Standard",
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

// // -----------------------------------------------------------------------------
// // PUT: Update an existing Course (handles optional new thumbnail upload)
// // -----------------------------------------------------------------------------
// app.put("/api/courses/:id", upload.single("thumbnail"), async (req, res) => {
//   try {
//     const course = await Course.findById(req.params.id);

//     if (!course) {
//       return res.status(404).json({
//         success: false,
//         message: "Course not found",
//       });
//     }

//     // 1. Update text fields if provided in request body
//     if (req.body.title !== undefined) course.title = req.body.title;
//     if (req.body.description !== undefined)
//       course.description = req.body.description;
//     if (req.body.instructor !== undefined)
//       course.instructor = req.body.instructor;
//     if (req.body.status !== undefined) course.status = req.body.status;
//     if (req.body.progress !== undefined)
//       course.progress = Number(req.body.progress);

//     // 2. Parse boolean values (handles string representations from FormData)
//     if (req.body.isPaid !== undefined) {
//       course.isPaid = req.body.isPaid === "true" || req.body.isPaid === true;
//     }
//     if (req.body.isNewCourse !== undefined) {
//       course.isNewCourse =
//         req.body.isNewCourse === "true" || req.body.isNewCourse === true;
//     }

//     // 3. Replace thumbnail if a new file is uploaded
//     if (req.file) {
//       // Unlink existing thumbnail file from disk if present
//       if (course.thumbnail) {
//         const oldFileName = course.thumbnail.split("/uploads/").pop();
//         if (oldFileName) {
//           const oldFilePath = path.join(process.cwd(), "uploads", oldFileName);
//           if (fs.existsSync(oldFilePath)) {
//             fs.unlinkSync(oldFilePath);
//           }
//         }
//       }

//       // Assign new uploaded thumbnail URL
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

// // -----------------------------------------------------------------------------
// // DELETE: Remove a Course & delete its thumbnail from storage
// // -----------------------------------------------------------------------------
// app.delete("/api/courses/:id", async (req, res) => {
//   try {
//     const course = await Course.findById(req.params.id);

//     if (!course) {
//       return res.status(404).json({
//         success: false,
//         message: "Course not found",
//       });
//     }

//     // 1. Delete thumbnail file from disk
//     if (course.thumbnail) {
//       const fileName = course.thumbnail.split("/uploads/").pop();
//       if (fileName) {
//         const filePath = path.join(process.cwd(), "uploads", fileName);
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       }
//     }

//     // 2. Delete database document
//     await Course.findByIdAndDelete(req.params.id);

//     return res.status(200).json({
//       success: true,
//       message: "Course and thumbnail deleted successfully",
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Server error while deleting course",
//     });
//   }
// });

// app.get("/api/courses", async (req, res) => {
//   try {
//     const { courseType, role } = req.query;
//     // If using JWT middleware: const role = req.user?.role;

//     let filterQuery = {};

//     // Check if user is NOT an admin
//     if (role !== "admin") {
//       // Safely check if courseType is undefined, null, or empty string
//       if (!courseType || typeof courseType !== "string" || !courseType.trim()) {
//         return res.status(200).json({
//           success: true,
//           count: 0,
//           data: [],
//         });
//       }

//       // Escape special regex characters safely
//       const escapedCourseType = courseType
//         .trim()
//         .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

//       filterQuery = {
//         title: { $regex: `^${escapedCourseType}$`, $options: "i" },
//       };
//     }
//     // If role === "admin", filterQuery remains {} to fetch all records regardless of courseType being undefined

//     const courses = await Course.find(filterQuery).sort({ createdAt: -1 });

//     return res.status(200).json({
//       success: true,
//       count: courses.length,
//       data: courses,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Server error while fetching courses",
//     });
//   }
// });

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

// GET: Fetch Personal Details
app.get("/api/personal-details/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Find personal details for the specific user
    let details = await PersonalDetails.findOne({ userId });

    // If no details exist yet for this user, create default record
    if (!details) {
      details = await PersonalDetails.create({
        userId,
        name: "Legala Manjula",
        gender: "Female",
      });
    }

    return res.status(200).json({ success: true, data: details });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/personal-details/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, aboutYou, gender, birthday, profileImage } = req.body;

    // Create the document for the first time
    const newDetails = await PersonalDetails.create({
      userId,
      name,
      aboutYou,
      gender,
      birthday,
      profileImage,
    });

    return res.status(201).json({ success: true, data: newDetails });
  } catch (error) {
    // If a document for this userId already exists, this will throw a duplicate key error
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Save/Update Personal Details
app.put("/api/personal-details/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, aboutYou, gender, birthday } = req.body;

    // Find and update personal details, creating a new document if it doesn't exist (upsert)
    const updatedDetails = await PersonalDetails.findOneAndUpdate(
      { userId },
      { name, aboutYou, gender, birthday },
      { new: true, runValidators: true, upsert: true },
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

app.get("/api/notifications", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId query parameter is required.",
      });
    }

    // Fetch all notifications for the recipient sorted by newest first
    const notifications = await Notification.find({ recipient: userId })
      .populate("sender", "username courseType role")
      .populate("postId", "content mediaFiles courseType")
      .sort({ createdAt: -1 });

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
app.put("/api/posts/:id", upload.array("newFiles"), async (req, res) => {
  try {
    // 1. Extract userId from req.body (or from req.user if using auth middleware)
    const { content, userId, removedMediaIds } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // 2. Normalize and compare post.userId with incoming userId
    const postUserId = post.userId ? post.userId.toString() : "";
    const incomingUserId = userId ? userId.toString() : "";

    if (!incomingUserId || postUserId !== incomingUserId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });
    }

    // 3. Update text content
    if (content !== undefined) post.content = content;

    // 4. Remove specified media files from disk & database
    if (removedMediaIds) {
      const idsToDelete = Array.isArray(removedMediaIds)
        ? removedMediaIds
        : [removedMediaIds];

      post.mediaFiles = post.mediaFiles.filter((file) => {
        if (idsToDelete.includes(file._id.toString())) {
          // Delete file physically from disk
          const filePath = path.join(process.cwd(), file.path);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          return false;
        }
        return true;
      });
    }

    // 5. Append newly uploaded media files
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

// GET: Fetch all scheduled live sessions grouped or sorted by date
// app.get("/api/session", async (req, res) => {
//   try {
//     const { role, courseType } = req.query;
//     let query = {};

//     // Filter sessions based on role and courseType
//     if (role === "user") {
//       if (courseType === "Face Yoga") {
//         // "Face Yoga" users ONLY see "Face Yoga" sessions
//         query.courseType = "Face Yoga";
//       } else if (courseType === "Face Yoga + Raj Yoga") {
//         // "Face Yoga + Raj Yoga" users see BOTH session types
//         query.courseType = { $in: ["Face Yoga", "Face Yoga + Raj Yoga"] };
//       }
//     }
//     // Note: If role === "admin" or role is undefined, query remains {} to return ALL sessions

//     const sessions = await LiveSession.find(query).sort({ createdAt: -1 });
//     return res.status(200).json({ success: true, data: sessions });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// POST: Admin create new live session
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
//     } = req.body;

//     if (
//       !title ||
//       !date ||
//       !startTime ||
//       !endTime ||
//       !meetingUrl ||
//       !courseType
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
//     });

//     const savedSession = await newSession.save();
//     return res.status(201).json({ success: true, data: savedSession });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// // PUT: Admin update an existing live session
// app.put("/api/session/:id", async (req, res) => {
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
//     } = req.body;

//     const updatedSession = await LiveSession.findByIdAndUpdate(
//       req.params.id,
//       {
//         $set: {
//           ...(title && { title }),
//           ...(date && { date }),
//           ...(startTime && { startTime }),
//           ...(endTime && { endTime }),
//           ...(occurrence !== undefined && { occurrence }),
//           ...(linkTypeNote !== undefined && { linkTypeNote }),
//           ...(meetingUrl && { meetingUrl }),
//           ...(courseType && { courseType }),
//         },
//       },
//       { new: true, runValidators: true },
//     );

//     if (!updatedSession) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Live session not found." });
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Live session updated successfully",
//       data: updatedSession,
//     });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

// // DELETE: Admin remove a session (fixed route prefix to /api/session/:id)
// app.delete("/api/session/:id", async (req, res) => {
//   try {
//     const deletedSession = await LiveSession.findByIdAndDelete(req.params.id);

//     if (!deletedSession) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Live session not found." });
//     }

//     return res.status(200).json({ success: true, message: "Session deleted" });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

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

// GET SESSIONS (Filtered by Language)
// app.get("/api/session", async (req, res) => {
//   try {
//     const { language, courseType } = req.query;
//     const formattedLang = language;

//     const filter = {};
//     if (formattedLang) filter.language = formattedLang;
//     if (courseType) filter.courseType = courseType;

//     const sessions = await LiveSession.find(filter).sort({ createdAt: -1 });
//     return res.status(200).json({ success: true, data: sessions });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: error.message });
//   }
// });

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

// POST endpoint: Creates document on first upload or updates it if it exists
app.post(
  "/api/personal-details/:userId/profile-image",
  upload.single("image"),
  async (req, res) => {
    try {
      const { userId } = req.params;

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No image file provided" });
      }

      const imagePath = `/uploads/${req.file.filename}`;

      // findOneAndUpdate + upsert creates a new document if it doesn't exist yet
      const details = await PersonalDetails.findOneAndUpdate(
        { userId },
        { $set: { profileImage: imagePath } },
        { new: true, upsert: true, runValidators: true },
      );

      return res.status(200).json({
        success: true,
        message: "Profile image saved successfully",
        data: details,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

// Upload Profile Image Endpoint
app.put(
  "/api/personal-details/:userId/profile-image",
  upload.single("image"),
  async (req, res) => {
    try {
      const { userId } = req.params;

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No image file provided" });
      }

      // Construct file access path (or use upload service URL)
      const imagePath = `/uploads/${req.file.filename}`;

      // Update or create document using $set
      const updatedDetails = await PersonalDetails.findOneAndUpdate(
        { userId },
        { $set: { profileImage: imagePath } },
        { new: true, upsert: true },
      );

      return res.status(200).json({
        success: true,
        message: "Profile image updated successfully",
        data: updatedDetails,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

// DELETE Profile Image Endpoint
app.delete("/api/personal-details/:userId/profile-image", async (req, res) => {
  try {
    const { userId } = req.params;

    // 1. Find user's current record
    const details = await PersonalDetails.findOne({ userId });

    if (!details || !details.profileImage) {
      return res
        .status(400)
        .json({ success: false, message: "No profile image to delete" });
    }

    // 2. Delete file from physical disk storage
    const filePath = path.join(__dirname, "..", details.profileImage);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 3. Clear profileImage string in MongoDB
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

// app.post("/api/admin-posts", upload.array("files"), async (req, res) => {
//   try {
//     const { userId, content, tagIds, fileTypes } = req.body;

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

//     const allUsers = await User.find({});
//     console.log("=== ALL USERS IN DATABASE ===");
//     console.log(
//       allUsers.map((u) => ({
//         id: u._id.toString(),
//         role: u.role,
//         username: u.username,
//       })),
//     );
//     console.log("Incoming userId from request:", userId);
//     console.log("===============================");
//     // 1. Fetch the actual user from MongoDB to get accurate role & courseType
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

//     // Parse JSON strings sent from Angular FormData
//     const parsedTagIds = tagIds ? JSON.parse(tagIds) : [];

//     // Normalize fileTypes array
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

//     // 2. Create the post using the author's database courseType
//     const newPost = new AdminPost({
//       userId,
//       content,
//       tagIds: parsedTagIds,
//       courseType: author.courseType,
//       mediaFiles,
//     });

//     await newPost.save();

//     // 3. Build target recipients query to match EVERY user in the collection except the post author
//     const targetUsers = await User.find({
//       _id: { $ne: author._id },
//     }).select("_id");

//     console.log(`Author ID: ${author._id}`);
//     console.log(`Target Recipients Count: ${targetUsers.length}`);

//     // 4. Bulk insert notification records for all recipients
//     if (targetUsers.length > 0) {
//       const notifications = targetUsers.map((user) => ({
//         recipient: user._id,
//         sender: author._id,
//         postId: newPost._id,
//         postModel: "AdminPost", // <--- Dynamic model reference
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
    // Falls back to Admin's registered language if targetLanguage isn't sent
    const postLanguage = targetLanguage || author.language || "English";

    // Parse JSON strings safely
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

    // 3. Save AdminPost with the designated language
    const newPost = new AdminPost({
      userId: author._id,
      content,
      language: postLanguage, // <--- Restricts post to this stream
      tagIds: parsedTagIds,
      courseType: author.courseType,
      mediaFiles,
    });

    await newPost.save();

    // 4. STRICT FILTER: Only fetch recipients whose language MATCHES postLanguage
    const targetUsers = await User.find({
      _id: { $ne: author._id },
      language: postLanguage, // <--- Only notifies students in English or Telugu stream
    }).select("_id");

    console.log(`Admin Post Created for Stream: ${postLanguage}`);
    console.log(`Notifying ${targetUsers.length} ${postLanguage} students.`);

    // 5. Send notifications ONLY to matching students
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

// app.get("/api/admin-posts", async (req, res) => {
//   try {
//     const posts = await AdminPost.aggregate([
//       // 1. Match post._id (ObjectId) directly with comment.postId (ObjectId)
//       {
//         $lookup: {
//           from: "comments",
//           localField: "_id",
//           foreignField: "postId",
//           as: "allComments",
//         },
//       },
//       // 2. Add total comment count field
//       {
//         $addFields: {
//           commentCount: { $size: "$allComments" },
//         },
//       },
//       // 3. Remove raw allComments array to keep the post response lightweight
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

// app.get("/api/admin-posts", async (req, res) => {
//   try {
//     const { language } = req.query;

//     // Convert route param (e.g. 'te' or 'en') to match DB casing ('Telugu' / 'English')
//     let formattedLang;
//     if (language) {
//       const lower = language.toLowerCase();
//       if (lower === "te" || lower === "telugu") formattedLang = "Telugu";
//       if (lower === "en" || lower === "english") formattedLang = "English";
//     }

//     const posts = await AdminPost.aggregate([
//       // 1. Filter by language if provided
//       ...(formattedLang ? [{ $match: { language: formattedLang } }] : []),

//       // 2. Join with comments
//       {
//         $lookup: {
//           from: "admincomments",
//           localField: "_id",
//           foreignField: "postId",
//           as: "allComments",
//         },
//       },
//       // 3. Add comment count
//       {
//         $addFields: {
//           commentCount: { $size: "$allComments" },
//         },
//       },
//       // 4. Cleanup and sort
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
      // 1. Filter by language if provided
      ...(formattedLang ? [{ $match: { language: formattedLang } }] : []),

      // 2. Join with user collection (author of the post)
      {
        $lookup: {
          from: "register", // Change to "register" if your MongoDB collection name is register
          let: { authorId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$_id" }, { $toString: "$$authorId" }],
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

      // 3. Join with admincomments
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

      // 4. Add comment count and populated userId object
      {
        $addFields: {
          commentCount: { $size: "$allComments" },
          userId: {
            _id: "$authorDetails._id",
            username: "$authorDetails.username",
            role: "$authorDetails.role",
            language: "$authorDetails.language",
          },
        },
      },

      // 5. Cleanup temporary arrays and sort
      {
        $project: {
          allComments: 0,
          authorDetails: 0,
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
// app.get("/api/admin-posts/admin/:adminId", async (req, res) => {
//   try {
//     const { adminId } = req.params;

//     // Validate if the userId string is a valid MongoDB ObjectId
//     if (!mongoose.Types.ObjectId.isValid(adminId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid user ID format",
//       });
//     }

//     const posts = await AdminPost.aggregate([
//       // 1. Filter posts matching the specific userId
//       {
//         $match: {
//           userId: new mongoose.Types.ObjectId(userId),
//         },
//       },
//       // 2. Join comments from the "comments" collection where post._id matches comment.postId
//       {
//         $lookup: {
//           from: "comments",
//           localField: "_id",
//           foreignField: "postId",
//           as: "allComments",
//         },
//       },
//       // 3. Add total comment count field
//       {
//         $addFields: {
//           commentCount: { $size: "$allComments" },
//         },
//       },
//       // 4. Remove raw allComments array to keep the payload lightweight
//       {
//         $project: {
//           allComments: 0,
//         },
//       },
//       // 5. Sort posts from newest to oldest
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

// UPDATE POST & MEDIA FILES
// app.put("/api/admin-posts/:id", upload.array("newFiles"), async (req, res) => {
//   try {
//     // 1. Extract userId from req.body (or from req.user if using auth middleware)
//     const { content, userId, removedMediaIds } = req.body;
//     const post = await AdminPost.findById(req.params.id);

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

// DELETE POST & ALL ASSOCIATED MEDIA
// app.delete("/api/admin-posts/:id", async (req, res) => {
//   try {
//     // Read userId from query params (handles both req.query.userId and req.query.userid)
//     const userId = req.query.userid;
//     const post = await AdminPost.findById(req.params.id);

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

//     // Delete attached media files from disk
//     if (post.mediaFiles && post.mediaFiles.length > 0) {
//       post.mediaFiles.forEach((file) => {
//         const filePath = path.join(process.cwd(), file.path);
//         if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
//       });
//     }

//     await AdminPost.findByIdAndDelete(req.params.id);
//     return res
//       .status(200)
//       .json({ success: true, message: "Post and media deleted" });
//   } catch (error) {
//     return res.status(500).json({ success: false, error: error.message });
//   }
// });

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

// // POST /api/comments
// app.post("/api/admin-comments", async (req, res) => {
//   try {
//     const { postId, userId, content, parentId, username } = req.body;

//     if (!postId || !userId || !content || !content.trim() || !username.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "postId, userId, and content are required fields.",
//       });
//     }

//     const newComment = await AdminComment.create({
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
// app.get("/api/admin-comments/post/:postId", async (req, res) => {
//   try {
//     const { postId } = req.params;

//     // Fetch all comments belonging to the post
//     const postComments = await AdminComment.find({ postId })
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

// POST /api/admin-comments
app.post("/api/admin-comments", async (req, res) => {
  try {
    const { postId, userId, content, parentId, username } = req.body;

    if (!postId || !userId || !content?.trim() || !username?.trim()) {
      return res.status(400).json({
        success: false,
        message: "postId, userId, username, and content are required fields.",
      });
    }

    const newComment = await AdminComment.create({
      postId,
      userId,
      username: username.trim(),
      content: content.trim(),
      parentId: parentId || null,
    });

    // Return lean object so frontend can attach properties cleanly
    return res.status(201).json(newComment.toObject());
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error submitting comment",
      error: error.message,
    });
  }
});

// GET /api/admin-comments/post/:postId
// app.get("/api/admin-comments/post/:postId", async (req, res) => {
//   try {
//     const { postId } = req.params;

//     // Fetch all comments (chronological order for replies)
//     const postComments = await AdminComment.find({ postId })
//       .sort({ createdAt: 1 })
//       .lean();

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

//     // Nest replies inside corresponding parent items
//     const structuredComments = parentComments
//       .map((parent) => ({
//         ...parent,
//         replies: repliesMap[parent._id.toString()] || [],
//       }))
//       .reverse(); // Reverse parents to show newest first

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

app.get("/api/admin-comments/post/:postId", async (req, res) => {
  try {
    const { postId } = req.params;

    // Fetch all comments and populate user details (username, profile details)
    const postComments = await AdminComment.find({ postId })
      .populate("userId", "username mobile role language") // Populates user info
      .sort({ createdAt: 1 })
      .lean();

    const parentComments = [];
    const repliesMap = {};

    postComments.forEach((c) => {
      // Fallback string conversion for parentId check
      if (!c.parentId) {
        parentComments.push({ ...c, replies: [] });
      } else {
        const pId = c.parentId.toString();
        if (!repliesMap[pId]) repliesMap[pId] = [];
        repliesMap[pId].push(c);
      }
    });

    // Nest replies inside corresponding parent items
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

// Mount the course routes under the '/api/courses' prefix
app.use("/api/course", courseRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

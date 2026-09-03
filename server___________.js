// import { MongoClient } from "mongodb";

// async function runGetStarted() {
//   // Replace the uri string with your connection string
//   const uri =
//     "mongodb+srv://jjanardhan:jjanardhan@cluster0.rjfkucv.mongodb.net/?appName=Cluster0";
//   const client = new MongoClient(uri);

//   try {
//     const database = client.db("sample_mflix");
//     const movies = database.collection("movies");

//     // Queries for a movie that has a title value of 'Back to the Future'
//     const query = { title: "Back to the Future" };
//     const movie = await movies.findOne(query);
//     console.log(movie);
//   } finally {
//     await client.close();
//   }
// }
// runGetStarted().catch(console.dir);

import dns from "node:dns";
import { MongoClient } from "mongodb";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const uri =
  "mongodb+srv://jjanardhan:A6pnU0lTkEBiCsIe@cluster0.rjfkucv.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri);

async function runGetStarted() {
  try {
    await client.connect();

    console.log("MongoDB connected successfully");

    const database = client.db("test");
    const movies = database.collection("post");

    // const movie = await movies.findOne({
    //   title: "Back to the Future",
    // });

    console.log("Movie:");
  } catch (error) {
    console.error("MongoDB connection failed:");
    console.error(error);
  } finally {
    await client.close();
  }
}

runGetStarted();

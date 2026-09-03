import dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

dns.promises
  .resolveSrv("_mongodb._tcp.cluster0.rjfkucv.mongodb.net")
  .then((result) => {
    console.log("DNS SUCCESS:");
    console.log(result);
  })
  .catch((error) => {
    console.error("DNS FAILED:");
    console.error(error);
  });

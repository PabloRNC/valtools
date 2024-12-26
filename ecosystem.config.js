module.exports = {
    apps: [
      {
        name: "valtools",
        script: "./dist/index.js",
        instances: "1",
        exec_mode: "cluster",
      },
    ],
  };
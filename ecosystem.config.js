module.exports = {
    apps: [
      {
        name: "valtools",
        script: "./dist/index.js",
        exec_mode: "fork",
        instances: 1,
      },
    ],
  };
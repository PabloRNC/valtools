const baseUrl = "https://just-formerly-pegasus.ngrok-free.app"


$(document).ready(function () {
  window.Twitch.ext.onContext(({ theme }) => {
    if (theme === "light") {
      $("body").css("background-color", "#f8f9fa");
      $("h1").css("color", "#343a40");
    } else {
      $("body").css("background-color", "#343a40");
      $("h1").css("color", "#f8f9fa");
    }
  });

  let token = null;
  let channelId = null;
  let firstAuth = true;

  const usernameInput = $("#username");
  const tagInput = $("#tag");
  const matchHistoryToggle = $("#matchHistoryToggle");
  const platformSelect = $("#platformSelect");
  const dailySelect = $("#dailySelect");
  const saveBtn = $("#saveBtn");
  const toastSuccess = $(".toast-success").toast({ delay: 5000 });
  const toastFail = $(".toast-fail").toast({ delay: 5000 });
  const toastSuccessBody = $("#successToastBody");
  const toastFailBody = $("#failToastBody");

  let initialUsername = "";
  let initialTag = "";
  let initialMatchHistory = true;
  let initialPlatform = "pc";
  let initialDaily = "all";

  window.Twitch.ext.onAuthorized(function (data) {
    console.log(data.token);
    token = data.token;
    channelId = data.channelId;

    if (firstAuth) {
      firstAuth = false;
      fetchInitialData();
    }
  });

  function fetchInitialData() {
    usernameInput.val("");
    tagInput.val("");
    $.ajax({
      url: `${baseUrl}/api/setup?channel_id=${channelId}`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      success: function (response) {
        if(response.data.platforms.includes('pc')) $("#pcSelect").show();
        if(response.data.platforms.includes('console')) $("#consoleSelect").show();
        initialUsername = response.data.username || "";
        initialTag = response.data.tag || "";
        initialMatchHistory =
          response.data.config?.match_history !== undefined
            ? response.data.config.match_history
            : true;
        initialPlatform = response.data.config?.platform || "pc";
        initialDaily = response.data.config?.daily.enabled
          ? response.data.config.daily.only_competitive
            ? "only_competitive"
            : "all"
          : "none";

        usernameInput.val(initialUsername);
        tagInput.val(initialTag);
        matchHistoryToggle.prop("checked", initialMatchHistory);
        platformSelect.val(initialPlatform);
        dailySelect.val(initialDaily);

        checkInputs();
      },
      error: function (xhr) {
        if (xhr.status === 404) {
          $("#authModal").modal("show");

          $("#loginBtn").click(function () {
            $("#modalContent").addClass("d-none");
            $("#loadingContent").removeClass("d-none");

            const websocket = new WebSocket(`${baseUrl}/ws/rso`);

            websocket.onopen = onWebSocketOpen.bind(websocket);

            websocket.onmessage = onWebSocketMessage.bind(websocket);

            websocket.onclose = onWebSocketClose.bind(websocket);
          });
        }
      },
    });
  }

  function checkInputs() {
    const currentMatchHistory = matchHistoryToggle.is(":checked");
    const currentPlatform = platformSelect.val();
    const currentDaily = dailySelect.val();
    const isModified =
      currentMatchHistory !== initialMatchHistory ||
      currentPlatform !== initialPlatform ||
      currentDaily !== initialDaily;

    saveBtn.prop("disabled", !isModified);
  }

  usernameInput.on("input", checkInputs);
  tagInput.on("input", checkInputs);
  matchHistoryToggle.on("change", checkInputs);
  platformSelect.on("change", checkInputs);
  dailySelect.on("change", checkInputs);
  saveBtn.click(function () {
    saveBtn.addClass("loading").prop("disabled", true);

    $.ajax({
      url: `${baseUrl}/api/setup`,
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: JSON.stringify({
        match_history: matchHistoryToggle.is(":checked"),
        platform: platformSelect.val(),
        daily: {
          enabled: dailySelect.val() !== "none",
          only_competitive: dailySelect.val() === "only_competitive",
        },
        channelId,
      }),
      success: function ({ message }) {
        saveBtn.removeClass("loading").addClass("loaded");
        saveBtn.css("background-color", "#28a745");

        setTimeout(() => {
          saveBtn.removeClass("loaded");
          checkInputs();
        }, 2000);

        initialUsername = usernameInput.val().trim();
        initialTag = tagInput.val().trim();
        initialMatchHistory = matchHistoryToggle.is(":checked");
        initialPlatform = platformSelect.val();
        initialDaily = dailySelect.val();
        toastSuccessBody.text(message);

        toastSuccess.toast("show");

        fetchInitialData();
      },
      error: function ({ responseText }) {
        toastFailBody.text(JSON.parse(responseText).error);
        toastFail.toast("show");
        saveBtn
          .removeClass("loading")
          .prop("disabled", false)
          .css("background-color", "#dc3545");
      },
    });
  });

  $("#closeModalBtn").click(() => {
    $("#authModal").modal("hide");
  });

  $("#reauthorizeBtn").click(() => {
    $("#closeModalBtn").show();
    $("#modalContent").addClass("d-none");
    $("#loadingContent").addClass("d-none");
    $("#authContent").removeClass("d-none");

    const websocket = new WebSocket(`${baseUrl}/ws/rso`);

    websocket.onopen = onWebSocketOpen.bind(websocket);

    websocket.onmessage = onWebSocketMessage.bind(websocket);

    websocket.onclose = onWebSocketClose.bind(websocket);

    $("#authModal").modal("show");
  });

  $("#logoutBtn").click(() => {
    $.ajax({
      url: `${baseUrl}/api/setup`,
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      success: function () {
        toastSuccessBody.text("Logged out successfully.");
        $("#modalContent").removeClass("d-none");
        $("#loadingContent").addClass("d-none");
        $("#authContent").addClass("d-none");

        $("#closeModalBtn").hide();

        fetchInitialData();
      },
      error: function () {
        toastFailBody.text("Failed to log out.");
        toastFail.toast("show");
      },
    });
  });

  function onWebSocketOpen() {
    console.log("RSO WebSocket is open now.");
    $("#closeModalBtn").click(() => {
      this.close();
    });
    this.send(
      JSON.stringify({
        metadata: {
          type: "session_auth",
        },
        payload: {
          authorization: token,
          channelId,
        },
      })
    );
  }

  function onWebSocketMessage(message) {
    const data = JSON.parse(message.data);

    switch (data.metadata?.type) {
      case "session_welcome":
        {
          console.log(
            "RSO WebSocket session established and sucessfully authenticated. Waiting for auth ready message."
          );
          this.send(
            JSON.stringify({
              metadata: {
                type: "ready_for_auth",
              },
            })
          );
        }
        break;

      case "auth_ready":
        {
          console.log("RSO WebSocket is ready for authentication.");
          $("#authBtn").attr(
            "href",
            data.payload.url
          );
          $("#loadingContent").addClass("d-none");
          $("#authContent").removeClass("d-none");
        }

        break;

      case "auth_complete":
        {
          console.log("RSO WebSocket authentication complete.");
          toastSuccessBody.text(`Authorization successful as ${data.payload.gameName}#${data.payload.tagLine}.`);
          toastSuccess.toast("show");
          $("#authModal").modal("hide");
          fetchInitialData();
        }

        break;

      case "no_valorant_account": {
        console.log("RSO WebSocket no Valorant account.");
        toastFailBody.text(
          "No Valorant account found. Please make sure you have played at least a match in the game with any platform."
        );
        toastFail.toast("show");
        if (usernameInput.val() !== "") {
          $("#authModal").modal("hide");
        } else {
          $("#modalContent").removeClass("d-none");
          $("#loadingContent").addClass("d-none");
          $("#authContent").addClass("d-none");
        }
      }

      break;

      default: {
        if (
          data.status === 401 &&
          data.error.toLowerCase() === "authorization transition expired"
        ) {
          console.log(
            "RSO WebSocket authorization transition expired. Reconnecting."
          );
          toastFailBody.text(
            "The authorization process run out of time. Please try again."
          );
          toastFail.toast("show");
          if(usernameInput.val() === "") {
            $("#modalContent").removeClass("d-none");
            $("#loadingContent").addClass("d-none");
            $("#authContent").addClass("d-none");
          } else {
            $("#authModal").modal("hide");
          }
        }
      }
    }
  }

  function onWebSocketClose() {
    console.log("RSO WebSocket is closed.");
  }
});

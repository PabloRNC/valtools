$(document).ready(async function () {
  const helper = window.Twitch.ext;

  const borders = await fetch("https://valorant-api.com/v1/levelborders")
    .then((res) => res.json())
    .then((res) => res.data);

  const ranks = await fetch("https://valorant-api.com/v1/competitivetiers")
    .then((res) => res.json())
    .then((res) => res.data)
    .then((res) => res.pop())
    .then((res) => res.tiers);

  const gameModes = await fetch("https://valorant-api.com/v1/gamemodes")
    .then((res) => res.json())
    .then((res) => res.data);

  const maps = await fetch("https://valorant-api.com/v1/maps")
    .then((res) => res.json())
    .then((res) => res.data);

  let firstAuth = true;
  let channelId = null;
  let token = null;

  helper.onAuthorized(async (data) => {
    token = data.token;
    channelId = data.channelId;
    if (firstAuth) {
      pullData();
      firstAuth = false;
    }
  });

  while (!channelId || !token) return;

  async function pullData() {
    $.ajax({
      url: `https://valtools.fin-tech.com/api/players/${channelId}`,
      type: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      success: async function ({ matchlist, mmr, player, mmrHistory, daily }) {
        $("#accountName").text(player.username);
        $("#accountTag").text(`#${player.tagLine}`);
        $("#accountLevel").text(player.accountLevel);
        $("#platformIcon").html(player.platform === "pc" ? '<svg xmlns="http://www.w3.org/2000/svg" class="overlay-icon-desktop" viewBox="0 0 576 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M64 0C28.7 0 0 28.7 0 64L0 352c0 35.3 28.7 64 64 64l176 0-10.7 32L160 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l256 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-69.3 0L336 416l176 0c35.3 0 64-28.7 64-64l0-288c0-35.3-28.7-64-64-64L64 0zM512 64l0 224L64 288 64 64l448 0z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" class="overlay-icon" viewBox="0 0 640 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M192 64C86 64 0 150 0 256S86 448 192 448l256 0c106 0 192-86 192-192s-86-192-192-192L192 64zM496 168a40 40 0 1 1 0 80 40 40 0 1 1 0-80zM392 304a40 40 0 1 1 80 0 40 40 0 1 1 -80 0zM168 200c0-13.3 10.7-24 24-24s24 10.7 24 24l0 32 32 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-32 0 0 32c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-32-32 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l32 0 0-32z"/></svg>')

        if (mmr) {
          $(".rank-container").show();
          $("#rankImage").attr(
            "src",
            `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${mmr.tier}/smallicon.png`
          );
          const tierData = ranks.find((x) => x.tier === mmr.tier);
          const tierName =
            tierData.tierName.charAt(0) +
            tierData.tierName.toLowerCase().slice(1);
          $("#rankName").text(
            mmr.leaderboard_rank
              ? `${tierName} #${mmr.leaderboard_rank}`
              : tierName
          );
          if (!mmr.rr) {
            $(".progress-container").hide();
            $("#progressBar").css("width", "0%");
            $("#progressText").html("");
          } else {
            $(".progress-container").show();
            $("#progressBar").css(
              "width",
              `${mmr.threshold ? (mmr.rr / mmr.threshold) * 100 : 100}%`
            );
            $("#progressText").html(
              mmr.threshold
                ? `${mmr.rr}/${mmr.threshold} <span>RR</span>`
                : `${mmr.rr} <span>RR</span>`
            );
          }
        } else {
          $(".rank-container").hide();
        }
        $(".container").css(
          "background-image",
          `url(https://media.valorant-api.com/playercards/${player.playerCard}/wideart.png)`
        );

        const border = borders.find((x, i) =>
          x.startingLevel <= Number(player.accountLevel) && borders[i + 1]
            ? borders.startingLevel > Number(player.accountLevel)
            : true
        );

        $("#levelBorder").attr("src", border.levelNumberAppearance);

        $(".circle-container").remove();

          const circleContainer = $("<div>").addClass("circle-container");

          $(".center-container").append(circleContainer);

          if(daily){

          const circleText = $("<div>")
            .addClass("circle-text")
            .text(`${daily.won}W/${daily.lost}L`);

          const circleSvg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
          );

          $(circleSvg).attr("viewBox", "0 0 36 36").addClass("circle-svg");

          const circleBg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
          );

          $(circleBg)
            .attr({
              d: "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831",
            })
            .addClass("circle-bg");

          const circleFg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
          );

          if(daily.won + daily.lost === 0) circleFg.style.stroke = "white";

          if(daily.won === 0 && daily.lost !== 0) $(circleFg).hide();

          $(circleFg)
            .attr({
              d: "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831",
              "stroke-dasharray": `${
                (daily.won + daily.lost === 0 ? 1 : daily.won / (daily.won + daily.lost)) * 100
              }, 100`,
            })
            .addClass("circle-fg");

          $(circleSvg).append(circleBg, circleFg);

          circleContainer.append(circleText, circleSvg);

          $(".streak").remove();

          if(daily.streak){

            const streak = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "svg"
            );  

            $(streak).attr("viewBox", "0 0 16 16")
              .attr("fill", "#FF4500")
              .addClass("streak")

            const path = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "path"
            );

            $(path).attr({
              d: "M8 16c3.314 0 6-2 6-5.5 0-1.5-.5-4-2.5-6 .25 1.5-1.25 2-1.25 2C11 4 9 .5 6 0c.357 2 .5 4-2 6-1.25 1-2 2.729-2 4.5C2 14 4.686 16 8 16m0-1c-1.657 0-3-1-3",
            });

            const text = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "text"
            );

            $(text).attr({
              x: "50%",
              y: "70%",
              "text-anchor": "middle",
              dy: ".3em",
              "font-family": "Arial",
              "font-size": "8",
              fill: "white",
            }).text(daily.streak);

            $(streak).append(path, text);

            $('.container').append(streak);
          }

          } else {
            circleContainer.opacity = 0;
            $(".streak").remove();
          }


        if (!matchlist) {
          $("#matchHistory").html(`<div class="info-container">
          <div class="info-icon">ℹ️</div>
          <div class="info-text">The streamer has disabled match history.</div>
        </div>`);
        } else {
          $("#matchHistory").empty();

          if (!matchlist?.length) {
            $("#matchHistory").html(`<div class="info-container">
          <div class="info-icon">ℹ️</div>
          <div class="info-text">The valorant player has not played any casual matches (not competitive) in a long time so nothing is displayed.</div>
        </div>`);
          } else {
            for (const match of matchlist) {
              const frame = $("<div>").addClass(
                `frame ${match.won ? "victory" : match.drawn ? "draw" : "defeat"} d-flex align-items-center justify-content-between`
              );

              const map = maps.find((x) => x.mapUrl === match.mapId);

              const bg = $("<div>")
                .addClass("bg")
                .css("width", "100%")
                .height("100%")
                .css("position", "absolute")
                .css("border-radius", "0 0 10px 10px")
                .css("left", "0px")
                .css("background-image", `url(${map.listViewIcon})`)
                .css("background-size", "cover")
                .css("filter", "blur(2px)")
                .css("-webkit-filter", "blur(2px)")
                .css("box-shadow", "inset 0 0 5px rgba(0, 0, 0, 0.5)")
                .css("overflow", "hidden");

              frame.append(bg);

              const agentIcon = $("<img>")
                .attr(
                  "src",
                  `https://media.valorant-api.com/agents/${match.agentId}/displayicon.png`
                )
                .addClass("agent-icon");
              frame.append(agentIcon);

              const kdaWrapper = $("<div>")
                .addClass("text-kda-wrapper")
                .append(
                  $("<div>")
                    .addClass("kda-text")
                    .text(`${match.kills}/${match.deaths}/${match.assists}`)
                )
                .append($("<div>").addClass("acs").text(`ACS: ${match.acs}`));
              frame.append(kdaWrapper);

              const mode = gameModes.find((x) =>
                x.assetPath.includes(
                  match.mode.split("/")[match.queueId === "swiftplay" ? 4 : 3]
                )
              );

              const displayName =
                mode.displayName.toLowerCase() === "standard"
                  ? match.queueId
                  : mode.displayName;

              const scoreWrapper = $("<div>")
                .addClass(
                  "text-score-wrapper d-flex flex-column align-items-center mx-auto"
                )
                .append(
                  $("<div>")
                    .addClass(`status-text ${match.won ? "victory" : match.drawn? "draw" : "defeat"}`)
                    .text(match.won ? "VICTORY" : match.drawn ? "drawn" : "DEFEAT")
                )
                .append($("<div>").addClass("score").text(match.score))
                .append($("<div>").addClass("mode").text(displayName));

              frame.append(scoreWrapper);

              if (!match.isDeathmatch) {
                const headshots = Number(match.headshots);

                const bodyshots = Number(match.bodyshots);

                const legshots = Number(match.legshots);

                const accuracy = $("<div>").addClass("accuracy");

                const svg = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "svg"
                );
                $(svg).attr("viewBox", "0 0 33.316 80").addClass("dummy");

                const g = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "g"
                );
                $(g).attr("transform", "translate(-636.875 -624)");

                const circle = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "circle"
                );
                $(circle).attr({
                  cx: "6.153",
                  cy: "6.153",
                  r: "6.153",
                  transform: "translate(647.387 624)",
                  fill:
                    headshots > bodyshots && headshots > legshots
                      ? "#fff"
                      : "rgba(255, 255, 255, 0.5)",
                });

                const path1 = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "path"
                );
                $(path1).attr({
                  d: "M29.285,26.472,24.17,13.678l-1.352,6.831H10.512l-1.363-6.84-5.117,12.8A2.049,2.049,0,1,1,.072,25.411L6.441,1.639l.008,0A2.055,2.055,0,0,1,8.461,0h4.1L16.67,4.1l4.1-4.1h4.111a2.048,2.048,0,0,1,2.016,1.712l6.352,23.7a2.049,2.049,0,1,1-3.959,1.061Z",
                  transform: "translate(636.875 638.36)",
                  fill:
                    bodyshots > headshots && bodyshots > legshots
                      ? "#fff"
                      : "rgba(255, 255, 255, 0.5)",
                });

                const path2 = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "path"
                );
                $(path2).attr({
                  d: "M6.521,41.025h0l-6.52,0L5.863,0H18.756l5.857,41.021-6.508,0L12.307,8.2,6.521,41.024Z",
                  transform: "translate(641.232 662.975)",
                  fill:
                    legshots > headshots && legshots > bodyshots
                      ? "#fff"
                      : "rgba(255, 255, 255, 0.5",
                });

                $(g).append(circle, path1, path2);
                $(svg).append(g);
                $(accuracy).append(svg);
                frame.append(accuracy);

                const accuracyText = $("<div>")
                  .addClass("accuracy-text")
                  .append(
                    $("<span>").text(
                      `${(Number(match.headshots) * 100).toFixed(2)}%`
                    )
                  )
                  .append(
                    $("<span>").text(
                      `${(Number(match.bodyshots) * 100).toFixed(2)}%`
                    )
                  )
                  .append(
                    $("<span>").text(
                      `${(Number(match.legshots) * 100).toFixed(2)}%`
                    )
                  );
                frame.append(accuracyText);
              } else scoreWrapper.css("left", "-8px");

              const mvp = $("<div>").addClass("mvp-badge");
              const star = $("<div>").addClass("star-icon").text("★");
              const mvpText = $("<div>")
                .addClass("mvp-text")
                .text(match.mvp ? "MVP" : "TEAM MVP");

              mvp.append(star, mvpText);

              if (!match.teamMvp && !match.mvp) mvp.css("opacity", "0");

              frame.append(mvp);

              $("#matchHistory").append(frame);
            }
          }

        }

          if (!mmrHistory) {
            $("#cMatchHistory").html(`<div class="info-container">
          <div class="info-icon">ℹ️</div>
          <div class="info-text">The streamer has disabled match history.</div>
        </div>`);
          } else {
            if (!mmrHistory?.length) {
              $("#cMatchHistory").html(`<div class="info-container">
          <div class="info-icon">ℹ️</div>
          <div class="info-text">The valorant player has not played any competitive match in a long time so nothing is displayed.</div>
        </div>`);
            } else {
              $("#cMatchHistory").empty();
              for (const match of mmrHistory) {
                const frame = $("<div>").addClass(
                  `frame ${match.won ? "victory" : match.drawn ? "draw" : "defeat"} d-flex align-items-center justify-content-between`
                );

                const map = maps.find((x) => x.mapUrl === match.mapId);

                const bg = $("<div>")
                  .addClass("bg")
                  .css("width", "100%")
                  .height("100%")
                  .css("position", "absolute")
                  .css("border-radius", "0 0 10px 10px")
                  .css("left", "0px")
                  .css("background-image", `url(${map.listViewIcon})`)
                  .css("background-size", "cover")
                  .css("filter", "blur(2px)")
                  .css("-webkit-filter", "blur(2px)")
                  .css("box-shadow", "inset 0 0 5px rgba(0, 0, 0, 0.5)")
                  .css("overflow", "hidden");

                frame.append(bg);

                const agentIcon = $("<img>")
                  .attr(
                    "src",
                    `https://media.valorant-api.com/agents/${match.agentId}/displayicon.png`
                  )
                  .addClass("agent-icon");
                frame.append(agentIcon);

                const kdaWrapper = $("<div>")
                  .addClass("text-kda-wrapper")
                  .append(
                    $("<div>")
                      .addClass("kda-text")
                      .text(`${match.kills}/${match.deaths}/${match.assists}`)
                  )
                  .append($("<div>").addClass("acs").text(`ACS: ${match.acs}`));

                frame.append(kdaWrapper);

                const scoreWrapper = $("<div>")
                  .addClass(
                    "text-score-wrapper d-flex flex-column align-items-center mx-auto"
                  )
                  .append(
                    $("<div>")
                      .addClass(
                        `status-text ${match.won ? "victory" : match.drawn ? "draw" : "defeat"}`
                      )
                      .text(match.won ? "VICTORY" : match.drawn ? "draw" : "DEFEAT")
                  )
                  .append($("<div>").addClass("score").text(match.score))
                  .append($("<div>").addClass("mode").text("competitive"));

                frame.append(scoreWrapper);

                const headshots = Number(match.headshots);

                const bodyshots = Number(match.bodyshots);

                const legshots = Number(match.legshots);

                const accuracy = $("<div>").addClass("accuracy");

                const svg = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "svg"
                );
                $(svg).attr("viewBox", "0 0 33.316 80").addClass("dummy");

                const g = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "g"
                );
                $(g).attr("transform", "translate(-636.875 -624)");

                const circle = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "circle"
                );
                $(circle).attr({
                  cx: "6.153",
                  cy: "6.153",
                  r: "6.153",
                  transform: "translate(647.387 624)",
                  fill:
                    headshots > bodyshots && headshots > legshots
                      ? "#fff"
                      : "rgba(255, 255, 255, 0.5)",
                });

                const path1 = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "path"
                );
                $(path1).attr({
                  d: "M29.285,26.472,24.17,13.678l-1.352,6.831H10.512l-1.363-6.84-5.117,12.8A2.049,2.049,0,1,1,.072,25.411L6.441,1.639l.008,0A2.055,2.055,0,0,1,8.461,0h4.1L16.67,4.1l4.1-4.1h4.111a2.048,2.048,0,0,1,2.016,1.712l6.352,23.7a2.049,2.049,0,1,1-3.959,1.061Z",
                  transform: "translate(636.875 638.36)",
                  fill:
                    bodyshots > headshots && bodyshots > legshots
                      ? "#fff"
                      : "rgba(255, 255, 255, 0.5)",
                });

                const path2 = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "path"
                );
                $(path2).attr({
                  d: "M6.521,41.025h0l-6.52,0L5.863,0H18.756l5.857,41.021-6.508,0L12.307,8.2,6.521,41.024Z",
                  transform: "translate(641.232 662.975)",
                  fill:
                    legshots > headshots && legshots > bodyshots
                      ? "#fff"
                      : "rgba(255, 255, 255, 0.5",
                });

                $(g).append(circle, path1, path2);
                $(svg).append(g);
                $(accuracy).append(svg);
                frame.append(accuracy);

                const accuracyText = $("<div>")
                  .addClass("accuracy-text")
                  .append(
                    $("<span>").text(
                      `${(Number(match.headshots) * 100).toFixed(2)}%`
                    )
                  )
                  .append(
                    $("<span>").text(
                      `${(Number(match.bodyshots) * 100).toFixed(2)}%`
                    )
                  )
                  .append(
                    $("<span>").text(
                      `${(Number(match.legshots) * 100).toFixed(2)}%`
                    )
                  );
                frame.append(accuracyText);

                const mvp = $("<div>").addClass("mvp-badge competitive");
                const star = $("<div>").addClass("star-icon").text("★");
                const mvpText = $("<div>")
                  .addClass("mvp-text")
                  .text(match.mvp ? "MVP" : "TEAM MVP");

                mvp.append(star, mvpText);

                if (!match.teamMvp && !match.mvp) mvp.css("opacity", "0");

                const url = ranks.find(
                  (x) => x.tier === match.competitiveTier
                ).smallIcon;

                const rank = $("<div>")
                  .addClass("rank-c")
                  .append($("<img>").attr("src", url))
                  .css("display", "block")
                  .css("justify-content", "center")
                  .css("align-items", "center");

                frame.append(rank);

                frame.append(mvp);

                $("#cMatchHistory").append(frame);
              }
            }
          }
        $("body").show();

        setTimeout(() => pullData(), 5000);
      },
      error: function (error) {
        if(error.status === 404) $("body").hide();
        setTimeout(() => pullData(), 5000);
      },
    });
  }

  function enableDrag() {
    const container = document.querySelector(".container-wrapper");

    let isDragging = false;
    let startX, startY, initialX, initialY;

    container.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialX = container.offsetLeft;
      initialY = container.offsetTop;
      document.body.style.cursor = "move";
    });

    document.addEventListener("mousemove", (e) => {
      if (isDragging) {
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        container.style.left = `${initialX + deltaX}px`;
        container.style.top = `${initialY + deltaY}px`;
      }
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      document.body.style.cursor = "default";
    });
  }

  $('#closeButton').on('click', () => {
    window.Twitch.ext.actions.minimize();
  })
  
  $('#playerInfoTab').on('click', () => {
    document.getElementById("mainContent").style.display = "flex";
    document.getElementById("matchHistory").style.display = "none";
    document.getElementById("cMatchHistory").style.display = "none";
    setActiveTab("playerInfoTab");
  })
  
  $('#casualMatchesTab').on('click', () =>{
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("matchHistory").style.display = "flex";
    document.getElementById("cMatchHistory").style.display = "none";
    setActiveTab("casualMatchesTab");
  })
  
  $('#competitiveMatchesTab').on('click', () => {
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("matchHistory").style.display = "none";
    document.getElementById("cMatchHistory").style.display = "flex";
    setActiveTab("competitiveMatchesTab");
  })
  
  function setActiveTab(selectedTabId) {
    document.querySelectorAll(".nav-link").forEach((tab) => {
      tab.classList.remove("active");
    });
  
    document.getElementById(selectedTabId).classList.add("active");
  }

  enableDrag();
});


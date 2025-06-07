"use strict";

let gl;                         // The webgl context.
let surface;                    // A surface model
let surfaceWebCam;              // A substrate for webcam image
let shProgram;                  // A shader program
let spaceball;                  // A SimpleRotator object that lets the user rotate the view by mouse.
let stereoCam;                  // Object holding stereo camera and its parameters

let iTextureWebCam = -1;
let video;
let webcamElement;
let videoTexture;

window.renderingParams = {
    eyeSeparation: 0.5,
    fov: 50 * Math.PI / 180,
    nearClip: 8.0,
    convergence: 9.0,
};

// Constructor
function ShaderProgram(name, program, bgProgram) {
    this.name = name;
    this.prog = program;
    this.bgProgram = bgProgram;

    // Location of the attribute variable in the shader program.
    this.iAttribVertex = -1;
    // Location of the uniform specifying a color for the primitive.
    this.iColor = -1;
    // Location of the uniform matrix representing the combined transformation.
    this.iModelViewProjectionMatrix = -1;

    this.Use = function(progType) {
        if(progType == "main"){
            gl.useProgram(this.prog);
        }
        if(progType == "background"){
            gl.useProgram(this.bgProgram);
        }
    }
}

/* Draws a colored cube, along with a set of coordinate axes.
 * (Note that the use of the above drawPrimitive function is not an efficient
 * way to draw with WebGL.  Here, the geometry is so simple that it doesn"t matter.)
 */
function draw() {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // PATH ZERO: DRAW ZERO PARALLAX WEBCAM
    if (iTextureWebCam >= 0) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
    }

    let matrOrth = m4.orthographic(0, 1, 0, 1, 8, 20);

    // Draw background video if available
    if (webcamElement && webcamElement.videoWidth > 0) {
        drawVideoBackground();
    }

    let data = {};
    CreateSurfaceData(data);
    surface = new Model("Surface");
    surface.BufferData(data.verticesF32, data.indicesU16);

    /* Get the view matrix from the SimpleRotator object.*/
    let modelView = spaceball.getViewMatrix();

    let rotateToPointZero = m4.axisRotation([0.707, 0.707, 0], 0.7);
    let translateToPointZero = m4.translation(0, 0, -10);

    const colorPolygon = new Float32Array([0.5, 0.5, 0.5, 1]);
    const colorEdge = new Float32Array([1, 1, 1, 1]);

    // The FIRST PASS (for the left eye)
    let matrLeftFrustum = stereoCam.calcLeftFrustum();
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, matrLeftFrustum);

    let translateLeftEye = m4.translation(stereoCam.eyeSeparation / 2, 0, 0);
    let matAccum0 = m4.multiply(rotateToPointZero, modelView);
    let matAccum1 = m4.multiply(translateLeftEye, matAccum0);
    let matAccum2 = m4.multiply(translateToPointZero, matAccum1);

    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccum2);

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 0);

    gl.colorMask(true, false, false, true);
    gl.uniform4fv(shProgram.iColor, colorPolygon);
    surface.Draw();
    gl.uniform4fv(shProgram.iColor, colorEdge);
    surface.DrawWireframe();

    // The SECOND PASS (for the right eye)
    gl.clear(gl.DEPTH_BUFFER_BIT);

    let matrRightFrustum = stereoCam.calcRightFrustum();
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, matrRightFrustum);

    let translateRightEye = m4.translation(-stereoCam.eyeSeparation / 2, 0, 0);
    matAccum0 = m4.multiply(rotateToPointZero, modelView);
    matAccum1 = m4.multiply(translateRightEye, matAccum0);
    matAccum2 = m4.multiply(translateToPointZero, matAccum1);

    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccum2);

    gl.colorMask(false, true, true, true);
    gl.uniform4fv(shProgram.iColor, colorPolygon);
    surface.Draw();
    gl.uniform4fv(shProgram.iColor, colorEdge);
    surface.DrawWireframe();

    // RESET specific params to their default state
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.colorMask(true, true, true, true);
}

async function initWebcam() {
    webcamElement = document.getElementById("webcam");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        webcamElement.srcObject = stream;

        // Create and set up video texture
        videoTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, videoTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        initBackgroundShaders();
    } catch (error) {
        console.error("Error accessing webcam:", error);
    }
}

function initBackgroundShaders() {
    const backgroundVertexShader = `
        attribute vec2 position;
        attribute vec2 texCoord;
        varying vec2 vTexCoord;
        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
            vTexCoord = texCoord;
        }
    `;

    const backgroundFragmentShader = `
        precision mediump float;
        uniform sampler2D uTexture;
        varying vec2 vTexCoord;
        void main() {
            gl_FragColor = texture2D(uTexture, vTexCoord);
        }
    `;

    let prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    let progbg = createProgram(gl, backgroundVertexShader, backgroundFragmentShader);
    shProgram = new ShaderProgram("Basic", prog, progbg);
}

function drawVideoBackground() {
    if (!shProgram || !shProgram.bgProgram) {
        initBackgroundShaders();
    }

    shProgram.Use("background");

    // Set up a simple quad for the background
    const vertices = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1]);
    const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

    // Create and bind buffers
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    // Set up attributes
    const positionLoc = gl.getAttribLocation(shProgram.bgProgram, "position");
    const texCoordLoc = gl.getAttribLocation(shProgram.bgProgram, "texCoord");

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    // Update texture
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, webcamElement);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Switch back to main program
    shProgram.Use("main");
}

/* Initialize the WebGL context. Called from init() */
function initGL() {
    shProgram.Use("main");

    shProgram.iAttribVertex = gl.getAttribLocation(shProgram.prog, "vertex");
    shProgram.iModelViewMatrix = gl.getUniformLocation(shProgram.prog, "ModelViewMatrix");
    shProgram.iProjectionMatrix = gl.getUniformLocation(shProgram.prog, "ProjectionMatrix");
    shProgram.iColor = gl.getUniformLocation(shProgram.prog, "color");

    stereoCam = new StereoCamera(
        window.renderingParams.eyeSeparation,
        window.renderingParams.convergence,
        1.3, // aspect ratio of canvas
        window.renderingParams.fov,
        window.renderingParams.nearClip,
        20.0 // decimeters
    );

    gl.enable(gl.DEPTH_TEST);
}

function createProgram(gl, vShader, fShader) {
    let vsh = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsh, vShader);
    gl.compileShader(vsh);
    if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
        throw new Error("Error in vertex shader: " + gl.getShaderInfoLog(vsh));
    }
    let fsh = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsh, fShader);
    gl.compileShader(fsh);
    if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
        throw new Error("Error in fragment shader: " + gl.getShaderInfoLog(fsh));
    }
    let prog = gl.createProgram();
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("Link error in program: " + gl.getProgramInfoLog(prog));
    }
    return prog;
}

/**
 * Initialization function that will be called when the page has loaded
 */
async function init() {
    let canvas;
    try {
        canvas = document.getElementById("webglcanvas");
        gl = canvas.getContext("webgl");
        if (!gl) {
            throw "Browser does not support WebGL";
        }
    } catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not get a WebGL graphics context.</p>";
        return;
    }
    try {
        await initWebcam();
        initGL(); // Initialize the WebGL graphics context
    } catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
        return;
    }

    video = document.createElement("video");
    video.autoplay = true;

    // Connect to video stream
    let constraints = { video: true };
    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
        video.srcObject = stream;
        let track = stream.getVideoTracks()[0];
        let settings = track.getSettings();
        iTextureWebCam = CreateWebCamTexture(settings.width, settings.height);
        video.play();
    }).catch(function (err) {
        console.log(err.name + ": " + err.message);
    });

    setInterval(draw, 1000 / 20); // 20 FPS

    spaceball = new TrackballRotator(canvas, draw, 0);

    // Expose update function to global scope
    window.updateParams = function() {
        const eyeSeparation = parseFloat(document.getElementById("eyeSeparation").value);
        const fov = parseFloat(document.getElementById("fov").value) * Math.PI / 180;
        const nearClip = parseFloat(document.getElementById("nearClip").value);
        const convergence = parseFloat(document.getElementById("convergence").value);

        window.renderingParams = { eyeSeparation, fov, nearClip, convergence };

        document.getElementById("eyeSeparationValue").textContent = eyeSeparation.toFixed(2);
        document.getElementById("fovValue").textContent = (fov * 180 / Math.PI).toFixed(0);
        document.getElementById("nearClipValue").textContent = nearClip.toFixed(1);
        document.getElementById("convergenceValue").textContent = convergence.toFixed(1);

        // Reinitialize stereoCam with new parameters
        stereoCam = new StereoCamera(
            window.renderingParams.eyeSeparation,
            window.renderingParams.convergence,
            1.3, // aspect ratio
            window.renderingParams.fov,
            window.renderingParams.nearClip,
            20.0
        );

        if (typeof draw === "function") {
            console.log("Redrawing with updated params:", window.renderingParams);
            draw();
        }
    };

    draw();
}
const { cos, sin, sqrt, pow, PI } = Math

function deg2rad(angle) {
    return angle * Math.PI / 180;
}


function Vertex(p)
{
    this.p = p;
    this.normal = [];
    this.triangles = [];
}

function Triangle(v0, v1, v2)
{
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
    this.normal = [];
    this.tangent = [];
}

// Constructor
function Model(name) {
    this.name = name;
    this.iVertexBuffer = gl.createBuffer();
    this.iIndexBuffer = gl.createBuffer();
    this.count = 0;

    this.BufferData = function(vertices, indices) {

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STREAM_DRAW);

        this.count = indices.length;
    }

    this.Draw = function() {
        gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    }

    this.DrawWireframe = function() {
        for (let p=0; p<this.count; p+=3)
            gl.drawElements(gl.LINE_LOOP, 3, gl.UNSIGNED_SHORT, p*2);
    }
}


function CreateSurfaceData(data) {
    const m = 6;
    const b = 6;
    const a = 4;
    const n = 0.5;
    const phi = 0;
    const omega = m * Math.PI / b;
    const scaler = 0.3;
    const NUM_STEPS_U = 30;
    const NUM_STEPS_R = 20;
    const MAX_U = Math.PI * 2;
    const MAX_R = b;
    const STEP_U = MAX_U / NUM_STEPS_U;
    const STEP_R = MAX_R / NUM_STEPS_R;

    function surfaceVertex(r, u) {
        const x = r * Math.cos(u);
        const y = r * Math.sin(u);
        const z = a * Math.exp(-n * r) * Math.sin(omega * r + phi);
        return [scaler * x, scaler * y, scaler * z];
    }

    let vertices = [];
    let normals = [];
    let indices = [];

    for (let ri = 0; ri <= NUM_STEPS_R; ri++) {
        const r = ri * STEP_R;
        for (let ui = 0; ui <= NUM_STEPS_U; ui++) {
            const u = ui * STEP_U;
            const vertex = surfaceVertex(r, u);
            vertices.push(...vertex);

            const nextR = ri < NUM_STEPS_R ? surfaceVertex(r + STEP_R, u) : vertex;
            const nextU = ui < NUM_STEPS_U ? surfaceVertex(r, u + STEP_U) : vertex;

            const dr = [nextR[0] - vertex[0], nextR[1] - vertex[1], nextR[2] - vertex[2]];
            const du = [nextU[0] - vertex[0], nextU[1] - vertex[1], nextU[2] - vertex[2]];

            const normal = [
                dr[1] * du[2] - dr[2] * du[1],
                dr[2] * du[0] - dr[0] * du[2],
                dr[0] * du[1] - dr[1] * du[0]
            ];

            const len = Math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2);
            normals.push(normal[0]/len, normal[1]/len, normal[2]/len);
        }
    }

    for (let ri = 0; ri < NUM_STEPS_R; ri++) {
        for (let ui = 0; ui < NUM_STEPS_U; ui++) {
            const i0 = ri * (NUM_STEPS_U + 1) + ui;
            const i1 = i0 + 1;
            const i2 = (ri + 1) * (NUM_STEPS_U + 1) + ui;
            const i3 = i2 + 1;

            indices.push(i0, i1, i2);
            indices.push(i1, i3, i2);
        }
    }

    data.verticesF32 = new Float32Array(vertices);
    data.normalsF32 = new Float32Array(normals);
    data.indicesU16 = new Uint16Array(indices);
}

// Make CreateSurfaceData globally accessible
window.CreateSurfaceData = CreateSurfaceData;
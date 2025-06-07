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
    const a = 20;
    const b = 20;
    const scaler = 0.1;
    const NUM_STEPS_BETA = 30;
    const NUM_STEPS_Z = 20;
    const MAX_BETA = Math.PI * 2;
    const MAX_Z = 20;
    const STEP_BETA = MAX_BETA / NUM_STEPS_BETA;
    const STEP_Z = MAX_Z / NUM_STEPS_Z;

    function r(z) {
        return z * Math.sqrt(z * (a - z)) / b;
    }

    function pearVertex(z, beta) {
        let x = r(z) * Math.sin(beta),
            y = r(z) * Math.cos(beta),
            cZ = z;
        return [scaler * x, scaler * y, scaler * cZ];
    }

    let vertices = [];
    let normals = [];
    let indices = [];

    for (let zi = 0; zi <= NUM_STEPS_Z; zi++) {
        const z = 1 + (zi * STEP_Z);
        for (let bi = 0; bi <= NUM_STEPS_BETA; bi++) {
            const beta = bi * STEP_BETA;
            const vertex = pearVertex(z, beta);
            vertices.push(...vertex);

            // Calculate normal (simplified)
            const nextZ = zi < NUM_STEPS_Z ? pearVertex(z + STEP_Z, beta) : vertex;
            const nextBeta = bi < NUM_STEPS_BETA ? pearVertex(z, beta + STEP_BETA) : vertex;

            const dz = [nextZ[0] - vertex[0], nextZ[1] - vertex[1], nextZ[2] - vertex[2]];
            const db = [nextBeta[0] - vertex[0], nextBeta[1] - vertex[1], nextBeta[2] - vertex[2]];

            const normal = [
                dz[1] * db[2] - dz[2] * db[1],
                dz[2] * db[0] - dz[0] * db[2],
                dz[0] * db[1] - dz[1] * db[0]
            ];

            const len = Math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2);
            normals.push(normal[0]/len, normal[1]/len, normal[2]/len);
        }
    }

    for (let zi = 0; zi < NUM_STEPS_Z; zi++) {
        for (let bi = 0; bi < NUM_STEPS_BETA; bi++) {
            const i0 = zi * (NUM_STEPS_BETA + 1) + bi;
            const i1 = i0 + 1;
            const i2 = (zi + 1) * (NUM_STEPS_BETA + 1) + bi;
            const i3 = i2 + 1;

            indices.push(i0, i1, i2);
            indices.push(i1, i3, i2);
        }
    }

    data.verticesF32 = new Float32Array(vertices);
    data.normalsF32 = new Float32Array(normals);
    data.indicesU16 = new Uint16Array(indices);
}

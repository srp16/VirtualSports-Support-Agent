import {
    BedrockAgentRuntimeClient,
    RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";

const client = new BedrockAgentRuntimeClient({region: process.env.AWS_REGION});

export const handler = async(event) => {
    const query = event.query;
    if(typeof query !== "string" || query.trim() === ""){
        return {error: "Falta el parametro query"}
    }

    const response = await client.send(
        new RetrieveCommand({
            knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
            retrievalQuery: {text: query},
            retrievalConfiguration: {
                vectorSearchConfiguration: {numberOfResults: 5},
            },
        }),
    );

    const passages = (response.retrievalResults ?? []).map((result) => {
        const uri = result.location?.s3Location?.uri ?? "Fuente desconocida";
        const text = result.content?.text ?? "";
        return `Fuente: ${uri}\n${text}`;
    });

    const text = passages.length
        ? passages.join("\n\n")
        : "La base de conocimiento no devolvio fragmentos para esa consulta";
    return {content: [{type: "text", text}]};
}
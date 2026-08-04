package com.fitness.aiservice;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"spring.cloud.config.enabled=false",
		"eureka.client.enabled=false",
		"spring.data.mongodb.uri=mongodb://localhost:27017/fitness_test",
		"spring.data.mongodb.auto-index-creation=false",
		"rabbitmq.exchange.name=fitness.exchange",
		"rabbitmq.queue.name=activity.queue",
		"rabbitmq.routing.key=activity.tracking",
		"gemini.api.url=http://localhost/",
		"gemini.api.key=test",
		"spring.rabbitmq.listener.simple.auto-startup=false",
		"spring.rabbitmq.listener.direct.auto-startup=false"
})
class AiserviceApplicationTests {

	@Test
	void contextLoads() {
	}

}
